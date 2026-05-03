#![forbid(unsafe_code)]

use std::{
    env,
    net::SocketAddr,
    path::PathBuf,
    sync::{Arc, Mutex},
};

use aes_gcm::{
    aead::{Aead, Payload},
    Aes256Gcm, Key, KeyInit, Nonce,
};
use anyhow::Context;
use axum::{
    extract::{Path as AxumPath, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use chrono::{DateTime, SecondsFormat, Utc};
use ed25519_dalek::{Signer, SigningKey};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

type SharedState = Arc<AppState>;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let config = AgentConfig::from_env()?;
    if let Some(parent) = config.database_path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)
                .with_context(|| format!("creating database directory {}", parent.display()))?;
        }
    }

    let connection = Connection::open(&config.database_path)
        .with_context(|| format!("opening {}", config.database_path.display()))?;
    init_db(&connection)?;

    let signing = SigningMaterial::from_env(&config.node_id);
    let crypto = CryptoMaterial::from_env(&config.node_id);
    let state = Arc::new(AppState {
        node_id: config.node_id.clone(),
        database_path: config.database_path.clone(),
        api_token: config.api_token.clone(),
        signing,
        crypto,
        started_at: now_iso(),
        db: Mutex::new(connection),
    });

    let app = build_router(state);
    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "service": "altiair-agent",
            "nodeId": config.node_id,
            "bind": config.bind.to_string(),
            "databasePath": config.database_path,
            "protectedRoutes": config.api_token.is_some(),
        }))?
    );

    let listener = tokio::net::TcpListener::bind(config.bind).await?;
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}

fn build_router(state: SharedState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/bundles", post(create_bundle))
        .route("/bundles/pending", get(list_pending))
        .route("/ledger", get(ledger))
        .route("/records/{record_id}", get(get_record))
        .route("/acks", post(create_ack))
        .route("/replication", get(replication))
        .with_state(state)
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
}

#[derive(Clone)]
struct AgentConfig {
    node_id: String,
    bind: SocketAddr,
    database_path: PathBuf,
    api_token: Option<String>,
}

impl AgentConfig {
    fn from_env() -> anyhow::Result<Self> {
        let node_id = env_string("ALTIAIR_NODE_ID").unwrap_or_else(|| "altiair-hub".to_string());
        let bind = env_string("ALTIAIR_AGENT_BIND")
            .unwrap_or_else(|| "127.0.0.1:8090".to_string())
            .parse()
            .context("ALTIAIR_AGENT_BIND must be host:port")?;
        let database_path = env_string("ALTIAIR_AGENT_DB")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("data/altiair-agent.sqlite"));
        let api_token = env_string("ALTIAIR_API_TOKEN");

        Ok(Self {
            node_id,
            bind,
            database_path,
            api_token,
        })
    }
}

struct AppState {
    node_id: String,
    database_path: PathBuf,
    api_token: Option<String>,
    signing: SigningMaterial,
    crypto: CryptoMaterial,
    started_at: String,
    db: Mutex<Connection>,
}

struct SigningMaterial {
    key: SigningKey,
    fingerprint: String,
    mode: KeyMode,
}

impl SigningMaterial {
    fn from_env(node_id: &str) -> Self {
        let (seed, mode) = key_seed_from_env(
            "ALTIAIR_AGENT_SIGNING_KEY",
            "ALTIAIR_AGENT_SIGNING_SECRET",
            &format!("altiair-demo-signing:{node_id}"),
        );
        let key = SigningKey::from_bytes(&seed);
        let fingerprint = fingerprint(key.verifying_key().as_bytes());
        Self {
            key,
            fingerprint,
            mode,
        }
    }
}

struct CryptoMaterial {
    key: [u8; 32],
    mode: KeyMode,
}

impl CryptoMaterial {
    fn from_env(node_id: &str) -> Self {
        let (key, mode) = key_seed_from_env(
            "ALTIAIR_AGENT_ENCRYPTION_KEY",
            "ALTIAIR_AGENT_ENCRYPTION_SECRET",
            &format!("altiair-demo-encryption:{node_id}"),
        );
        Self { key, mode }
    }

    fn encrypt(
        &self,
        plaintext: &[u8],
        record_id: &str,
        content_hash: &str,
        received_at: &str,
    ) -> Result<EncryptedPayload, ApiError> {
        let aad = encryption_aad(record_id, content_hash);
        let nonce_bytes = nonce_bytes(record_id, content_hash, received_at);
        let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&self.key));
        let ciphertext = cipher
            .encrypt(
                Nonce::from_slice(&nonce_bytes),
                Payload {
                    msg: plaintext,
                    aad: aad.as_bytes(),
                },
            )
            .map_err(|_| ApiError::internal("failed to encrypt record payload"))?;

        Ok(EncryptedPayload {
            nonce_hex: hex::encode(nonce_bytes),
            ciphertext_b64: BASE64.encode(ciphertext),
        })
    }

    fn decrypt(
        &self,
        encrypted: &EncryptedPayload,
        record_id: &str,
        content_hash: &str,
    ) -> Result<Vec<u8>, ApiError> {
        let aad = encryption_aad(record_id, content_hash);
        let nonce = hex::decode(&encrypted.nonce_hex)
            .map_err(|_| ApiError::internal("stored nonce is invalid hex"))?;
        let ciphertext = BASE64
            .decode(&encrypted.ciphertext_b64)
            .map_err(|_| ApiError::internal("stored ciphertext is invalid base64"))?;
        let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&self.key));
        cipher
            .decrypt(
                Nonce::from_slice(&nonce),
                Payload {
                    msg: &ciphertext,
                    aad: aad.as_bytes(),
                },
            )
            .map_err(|_| ApiError::internal("failed to decrypt record payload"))
    }
}

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
enum KeyMode {
    ConfiguredKey,
    ConfiguredSecret,
    DemoDerived,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AckRequest {
    record_id: String,
    peer_node_id: String,
    acknowledged_at: Option<String>,
}

#[derive(Debug)]
struct BundleFields {
    id: String,
    mission_id: String,
    source_node_id: String,
    created_at: String,
    policy_state: String,
}

impl BundleFields {
    fn from_payload(payload: &Value) -> Result<Self, ApiError> {
        let object = payload
            .as_object()
            .ok_or_else(|| ApiError::bad_request("bundle payload must be a JSON object"))?;
        let id = required_string(object, "id")?;
        let mission_id = required_string(object, "missionId")?;
        let source_node_id = required_string(object, "sourceNodeId")?;
        let created_at = required_string(object, "createdAt")?;
        validate_timestamp(&created_at, "createdAt")?;
        let policy_state = derive_policy_state(payload);
        Ok(Self {
            id,
            mission_id,
            source_node_id,
            created_at,
            policy_state,
        })
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredRecord {
    record_id: String,
    bundle_id: String,
    mission_id: String,
    source_node_id: String,
    producer_node_id: String,
    created_at: String,
    received_at: String,
    policy_state: String,
    content_hash: String,
    signature: String,
    signing_key_fingerprint: String,
    encrypted_at_rest: bool,
    status: String,
    ack_count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredRecordWithPayload {
    #[serde(flatten)]
    record: StoredRecord,
    payload: Value,
}

#[derive(Debug)]
struct EncryptedPayload {
    nonce_hex: String,
    ciphertext_b64: String,
}

#[derive(Debug)]
struct RecordPreimage {
    record_id: String,
    mission_id: String,
    source_node_id: String,
    producer_node_id: String,
    created_at: String,
    received_at: String,
    policy_state: String,
    content_hash: String,
}

impl RecordPreimage {
    fn as_string(&self) -> String {
        [
            "altiair-agent-record-v1",
            &self.record_id,
            &self.mission_id,
            &self.source_node_id,
            &self.producer_node_id,
            &self.created_at,
            &self.received_at,
            &self.policy_state,
            &self.content_hash,
        ]
        .join("|")
    }
}

async fn health(State(state): State<SharedState>) -> Response {
    let queue_depth = state
        .db
        .lock()
        .map_err(|_| ApiError::internal("database lock poisoned"))
        .and_then(|db| count_records(&db))
        .unwrap_or(0);

    with_security_headers(
        Json(json!({
            "service": "altiair-agent",
            "schemaVersion": "altiair-agent-health-v1",
            "nodeId": state.node_id,
            "startedAt": state.started_at,
            "observedAt": now_iso(),
            "queueDepth": queue_depth,
            "databasePath": state.database_path,
            "protectedRoutes": state.api_token.is_some(),
            "memorySafe": {
                "language": "Rust",
                "forbidUnsafeCode": true,
                "crate": "altiair-agent"
            },
            "signing": {
                "algorithm": "ed25519",
                "keyFingerprint": state.signing.fingerprint,
                "keyMode": state.signing.mode
            },
            "storage": {
                "engine": "sqlite",
                "encryptedAtRest": true,
                "encryption": "aes-256-gcm",
                "keyMode": state.crypto.mode
            }
        }))
        .into_response(),
    )
}

async fn create_bundle(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(payload): Json<Value>,
) -> Result<Response, ApiError> {
    authorize(&state, &headers)?;
    let result = store_bundle(&state, payload)?;
    Ok(with_security_headers(
        (
            StatusCode::ACCEPTED,
            Json(json!({
                "accepted": true,
                "storedLocal": true,
                "record": result,
                "ledger": {
                    "encryptedAtRest": true,
                    "signedByNodeId": state.node_id,
                    "signingKeyFingerprint": state.signing.fingerprint
                }
            })),
        )
            .into_response(),
    ))
}

async fn list_pending(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    authorize(&state, &headers)?;
    let records = {
        let db = state
            .db
            .lock()
            .map_err(|_| ApiError::internal("database lock poisoned"))?;
        list_records(&db)?
    };
    Ok(with_security_headers(
        Json(json!({
            "nodeId": state.node_id,
            "pendingCount": records.len(),
            "records": records
        }))
        .into_response(),
    ))
}

async fn ledger(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    authorize(&state, &headers)?;
    let records = {
        let db = state
            .db
            .lock()
            .map_err(|_| ApiError::internal("database lock poisoned"))?;
        list_records(&db)?
    };
    Ok(with_security_headers(
        Json(json!({
            "schemaVersion": "altiair-agent-ledger-v1",
            "nodeId": state.node_id,
            "recordCount": records.len(),
            "encryptedAtRest": true,
            "signedRecords": true,
            "records": records
        }))
        .into_response(),
    ))
}

async fn get_record(
    State(state): State<SharedState>,
    headers: HeaderMap,
    AxumPath(record_id): AxumPath<String>,
) -> Result<Response, ApiError> {
    authorize(&state, &headers)?;
    let record = load_record_with_payload(&state, &record_id)?
        .ok_or_else(|| ApiError::not_found("record not found"))?;
    Ok(with_security_headers(Json(record).into_response()))
}

async fn create_ack(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(request): Json<AckRequest>,
) -> Result<Response, ApiError> {
    authorize(&state, &headers)?;
    if request.record_id.trim().is_empty() || request.peer_node_id.trim().is_empty() {
        return Err(ApiError::bad_request(
            "recordId and peerNodeId must be non-empty strings",
        ));
    }
    let acknowledged_at = request.acknowledged_at.unwrap_or_else(now_iso);
    validate_timestamp(&acknowledged_at, "acknowledgedAt")?;
    let ack_count = {
        let db = state
            .db
            .lock()
            .map_err(|_| ApiError::internal("database lock poisoned"))?;
        let exists = record_exists(&db, &request.record_id)?;
        if !exists {
            return Err(ApiError::not_found("record not found"));
        }
        db.execute(
            "insert into peer_acks(record_id, peer_node_id, acknowledged_at)
             values (?1, ?2, ?3)
             on conflict(record_id, peer_node_id) do update set acknowledged_at = excluded.acknowledged_at",
            params![request.record_id, request.peer_node_id, acknowledged_at],
        )
        .map_err(ApiError::db)?;
        count_acks(&db, &request.record_id)?
    };

    Ok(with_security_headers(
        Json(json!({
            "accepted": true,
            "recordId": request.record_id,
            "peerNodeId": request.peer_node_id,
            "acknowledgedAt": acknowledged_at,
            "ackCount": ack_count
        }))
        .into_response(),
    ))
}

async fn replication(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    authorize(&state, &headers)?;
    let records = {
        let db = state
            .db
            .lock()
            .map_err(|_| ApiError::internal("database lock poisoned"))?;
        list_records(&db)?
    };
    Ok(with_security_headers(
        Json(json!({
            "schemaVersion": "altiair-agent-replication-v1",
            "nodeId": state.node_id,
            "recordCount": records.len(),
            "records": records,
            "notes": [
                "Records are idempotent by record id and content hash.",
                "Payloads are encrypted at rest with AES-256-GCM.",
                "Records created locally are signed with Ed25519."
            ]
        }))
        .into_response(),
    ))
}

fn store_bundle(state: &AppState, payload: Value) -> Result<StoredRecord, ApiError> {
    let fields = BundleFields::from_payload(&payload)?;
    let payload_bytes = serde_json::to_vec(&payload)
        .map_err(|_| ApiError::bad_request("bundle payload is not serializable JSON"))?;
    let content_hash = sha256_hex(&payload_bytes);
    let received_at = now_iso();
    let record_id = format!("bundle:{}", fields.id);

    let preimage = RecordPreimage {
        record_id: record_id.clone(),
        mission_id: fields.mission_id.clone(),
        source_node_id: fields.source_node_id.clone(),
        producer_node_id: state.node_id.clone(),
        created_at: fields.created_at.clone(),
        received_at: received_at.clone(),
        policy_state: fields.policy_state.clone(),
        content_hash: content_hash.clone(),
    };
    let signature = sign_preimage(&state.signing, &preimage);
    let encrypted =
        state
            .crypto
            .encrypt(&payload_bytes, &record_id, &content_hash, &received_at)?;

    let db = state
        .db
        .lock()
        .map_err(|_| ApiError::internal("database lock poisoned"))?;

    if let Some(existing) = find_record(&db, &record_id)? {
        if existing.content_hash != content_hash {
            return Err(ApiError::conflict(
                "record id already exists with different content hash",
            ));
        }
        return Ok(existing);
    }

    db.execute(
        "insert into records(
            record_id, bundle_id, mission_id, source_node_id, producer_node_id,
            created_at, received_at, policy_state, content_hash, signature,
            signing_key_fingerprint, encryption_nonce, payload_ciphertext, status
         ) values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 'pending')",
        params![
            record_id,
            fields.id,
            fields.mission_id,
            fields.source_node_id,
            state.node_id,
            fields.created_at,
            received_at,
            fields.policy_state,
            content_hash,
            signature,
            state.signing.fingerprint,
            encrypted.nonce_hex,
            encrypted.ciphertext_b64,
        ],
    )
    .map_err(ApiError::db)?;

    find_record(&db, &record_id)?
        .ok_or_else(|| ApiError::internal("record insert did not round-trip"))
}

fn load_record_with_payload(
    state: &AppState,
    record_id: &str,
) -> Result<Option<StoredRecordWithPayload>, ApiError> {
    let db = state
        .db
        .lock()
        .map_err(|_| ApiError::internal("database lock poisoned"))?;
    let row = db
        .query_row(
            "select
                r.record_id, r.bundle_id, r.mission_id, r.source_node_id, r.producer_node_id,
                r.created_at, r.received_at, r.policy_state, r.content_hash, r.signature,
                r.signing_key_fingerprint, r.encryption_nonce, r.payload_ciphertext, r.status,
                (select count(*) from peer_acks a where a.record_id = r.record_id) as ack_count
             from records r
             where r.record_id = ?1",
            [record_id],
            |row| {
                let record = StoredRecord {
                    record_id: row.get(0)?,
                    bundle_id: row.get(1)?,
                    mission_id: row.get(2)?,
                    source_node_id: row.get(3)?,
                    producer_node_id: row.get(4)?,
                    created_at: row.get(5)?,
                    received_at: row.get(6)?,
                    policy_state: row.get(7)?,
                    content_hash: row.get(8)?,
                    signature: row.get(9)?,
                    signing_key_fingerprint: row.get(10)?,
                    encrypted_at_rest: true,
                    status: row.get(13)?,
                    ack_count: row.get(14)?,
                };
                let encrypted = EncryptedPayload {
                    nonce_hex: row.get(11)?,
                    ciphertext_b64: row.get(12)?,
                };
                Ok((record, encrypted))
            },
        )
        .optional()
        .map_err(ApiError::db)?;

    match row {
        Some((record, encrypted)) => {
            let plaintext =
                state
                    .crypto
                    .decrypt(&encrypted, &record.record_id, &record.content_hash)?;
            let payload = serde_json::from_slice(&plaintext)
                .map_err(|_| ApiError::internal("stored payload is not valid JSON"))?;
            Ok(Some(StoredRecordWithPayload { record, payload }))
        }
        None => Ok(None),
    }
}

fn init_db(connection: &Connection) -> anyhow::Result<()> {
    connection.execute_batch(
        "
        pragma journal_mode = wal;
        pragma foreign_keys = on;

        create table if not exists records (
          record_id text primary key,
          bundle_id text not null,
          mission_id text not null,
          source_node_id text not null,
          producer_node_id text not null,
          created_at text not null,
          received_at text not null,
          policy_state text not null,
          content_hash text not null unique,
          signature text not null,
          signing_key_fingerprint text not null,
          encryption_nonce text not null,
          payload_ciphertext text not null,
          status text not null check(status in ('pending', 'replicated', 'uploaded', 'held')),
          inserted_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        );

        create table if not exists peer_acks (
          record_id text not null references records(record_id) on delete cascade,
          peer_node_id text not null,
          acknowledged_at text not null,
          primary key(record_id, peer_node_id)
        );
        ",
    )?;
    Ok(())
}

fn find_record(db: &Connection, record_id: &str) -> Result<Option<StoredRecord>, ApiError> {
    db.query_row(
        "select
            r.record_id, r.bundle_id, r.mission_id, r.source_node_id, r.producer_node_id,
            r.created_at, r.received_at, r.policy_state, r.content_hash, r.signature,
            r.signing_key_fingerprint, r.status,
            (select count(*) from peer_acks a where a.record_id = r.record_id) as ack_count
         from records r
         where r.record_id = ?1",
        [record_id],
        stored_record_from_row,
    )
    .optional()
    .map_err(ApiError::db)
}

fn list_records(db: &Connection) -> Result<Vec<StoredRecord>, ApiError> {
    let mut statement = db
        .prepare(
            "select
                r.record_id, r.bundle_id, r.mission_id, r.source_node_id, r.producer_node_id,
                r.created_at, r.received_at, r.policy_state, r.content_hash, r.signature,
                r.signing_key_fingerprint, r.status,
                (select count(*) from peer_acks a where a.record_id = r.record_id) as ack_count
             from records r
             order by r.received_at asc, r.record_id asc",
        )
        .map_err(ApiError::db)?;
    let rows = statement
        .query_map([], stored_record_from_row)
        .map_err(ApiError::db)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(ApiError::db)
}

fn stored_record_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<StoredRecord> {
    Ok(StoredRecord {
        record_id: row.get(0)?,
        bundle_id: row.get(1)?,
        mission_id: row.get(2)?,
        source_node_id: row.get(3)?,
        producer_node_id: row.get(4)?,
        created_at: row.get(5)?,
        received_at: row.get(6)?,
        policy_state: row.get(7)?,
        content_hash: row.get(8)?,
        signature: row.get(9)?,
        signing_key_fingerprint: row.get(10)?,
        encrypted_at_rest: true,
        status: row.get(11)?,
        ack_count: row.get(12)?,
    })
}

fn count_records(db: &Connection) -> Result<i64, ApiError> {
    db.query_row("select count(*) from records", [], |row| row.get(0))
        .map_err(ApiError::db)
}

fn count_acks(db: &Connection, record_id: &str) -> Result<i64, ApiError> {
    db.query_row(
        "select count(*) from peer_acks where record_id = ?1",
        [record_id],
        |row| row.get(0),
    )
    .map_err(ApiError::db)
}

fn record_exists(db: &Connection, record_id: &str) -> Result<bool, ApiError> {
    db.query_row(
        "select exists(select 1 from records where record_id = ?1)",
        [record_id],
        |row| row.get::<_, i64>(0),
    )
    .map(|value| value == 1)
    .map_err(ApiError::db)
}

fn authorize(state: &AppState, headers: &HeaderMap) -> Result<(), ApiError> {
    let Some(expected) = &state.api_token else {
        return Ok(());
    };
    let actual = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "));
    if actual == Some(expected.as_str()) {
        Ok(())
    } else {
        Err(ApiError::new(
            StatusCode::UNAUTHORIZED,
            "protected route requires Authorization: Bearer <token>",
        ))
    }
}

#[derive(Debug)]
struct ApiError {
    status: StatusCode,
    message: String,
}

impl ApiError {
    fn new(status: StatusCode, message: impl Into<String>) -> Self {
        Self {
            status,
            message: message.into(),
        }
    }

    fn bad_request(message: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_REQUEST, message)
    }

    fn conflict(message: impl Into<String>) -> Self {
        Self::new(StatusCode::CONFLICT, message)
    }

    fn not_found(message: impl Into<String>) -> Self {
        Self::new(StatusCode::NOT_FOUND, message)
    }

    fn internal(message: impl Into<String>) -> Self {
        Self::new(StatusCode::INTERNAL_SERVER_ERROR, message)
    }

    fn db(error: rusqlite::Error) -> Self {
        Self::internal(format!("database error: {error}"))
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        with_security_headers(
            (
                self.status,
                Json(json!({
                    "error": self.message,
                    "status": self.status.as_u16()
                })),
            )
                .into_response(),
        )
    }
}

fn with_security_headers(mut response: Response) -> Response {
    let headers = response.headers_mut();
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    headers.insert("referrer-policy", HeaderValue::from_static("no-referrer"));
    headers.insert("x-frame-options", HeaderValue::from_static("DENY"));
    headers.insert(
        "cross-origin-resource-policy",
        HeaderValue::from_static("same-origin"),
    );
    headers.insert(
        "permissions-policy",
        HeaderValue::from_static("camera=(), microphone=(), geolocation=(), usb=(), serial=()"),
    );
    headers.insert(
        "content-security-policy",
        HeaderValue::from_static(
            "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        ),
    );
    response
}

fn required_string(
    object: &serde_json::Map<String, Value>,
    field: &str,
) -> Result<String, ApiError> {
    object
        .get(field)
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(ToOwned::to_owned)
        .ok_or_else(|| ApiError::bad_request(format!("bundle.{field} must be a non-empty string")))
}

fn derive_policy_state(payload: &Value) -> String {
    payload
        .get("counterUasCues")
        .and_then(Value::as_array)
        .and_then(|cues| cues.first())
        .and_then(|cue| cue.get("policyGate"))
        .and_then(Value::as_str)
        .or_else(|| payload.get("policyState").and_then(Value::as_str))
        .filter(|value| {
            matches!(
                *value,
                "collect_only" | "review_needed" | "authorized_to_share" | "blocked"
            )
        })
        .unwrap_or("review_needed")
        .to_string()
}

fn validate_timestamp(value: &str, field: &str) -> Result<(), ApiError> {
    DateTime::parse_from_rfc3339(value)
        .map(|_| ())
        .map_err(|_| ApiError::bad_request(format!("{field} must be an RFC3339 timestamp")))
}

fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn sign_preimage(signing: &SigningMaterial, preimage: &RecordPreimage) -> String {
    let signature = signing.key.sign(preimage.as_string().as_bytes());
    hex::encode(signature.to_bytes())
}

fn key_seed_from_env(key_var: &str, secret_var: &str, fallback: &str) -> ([u8; 32], KeyMode) {
    if let Some(value) = env_string(key_var) {
        return (seed_from_material(&value), KeyMode::ConfiguredKey);
    }
    if let Some(value) = env_string(secret_var) {
        return (seed_from_material(&value), KeyMode::ConfiguredSecret);
    }
    (seed_from_material(fallback), KeyMode::DemoDerived)
}

fn seed_from_material(value: &str) -> [u8; 32] {
    if value.len() == 64 {
        if let Ok(bytes) = hex::decode(value) {
            if bytes.len() == 32 {
                let mut seed = [0_u8; 32];
                seed.copy_from_slice(&bytes);
                return seed;
            }
        }
    }
    let digest = Sha256::digest(value.as_bytes());
    let mut seed = [0_u8; 32];
    seed.copy_from_slice(&digest);
    seed
}

fn sha256_hex(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

fn fingerprint(bytes: &[u8]) -> String {
    sha256_hex(bytes).chars().take(32).collect()
}

fn encryption_aad(record_id: &str, content_hash: &str) -> String {
    format!("altiair-agent-payload-v1|{record_id}|{content_hash}")
}

fn nonce_bytes(record_id: &str, content_hash: &str, received_at: &str) -> [u8; 12] {
    let digest = Sha256::digest(format!("{record_id}|{content_hash}|{received_at}").as_bytes());
    let mut nonce = [0_u8; 12];
    nonce.copy_from_slice(&digest[..12]);
    nonce
}

fn env_string(name: &str) -> Option<String> {
    env::var(name)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signature, Verifier};

    fn test_state() -> SharedState {
        let connection = Connection::open_in_memory().unwrap();
        init_db(&connection).unwrap();
        Arc::new(AppState {
            node_id: "altiair-test".to_string(),
            database_path: std::path::Path::new(":memory:").to_path_buf(),
            api_token: Some("test-token".to_string()),
            signing: SigningMaterial {
                key: SigningKey::from_bytes(&seed_from_material("test-signing")),
                fingerprint: "test-fingerprint".to_string(),
                mode: KeyMode::ConfiguredSecret,
            },
            crypto: CryptoMaterial {
                key: seed_from_material("test-encryption"),
                mode: KeyMode::ConfiguredSecret,
            },
            started_at: now_iso(),
            db: Mutex::new(connection),
        })
    }

    fn sample_bundle() -> Value {
        json!({
            "id": "bundle-test-001",
            "missionId": "mission-test",
            "sourceNodeId": "altiair-node-b",
            "createdAt": "2026-05-03T10:00:00.000Z",
            "sensorEvents": [{
                "id": "rfid-test-001",
                "kind": "rfid",
                "sourceNodeId": "altiair-node-b",
                "observedAt": "2026-05-03T10:00:00.000Z",
                "receivedAt": "2026-05-03T10:00:00.100Z",
                "readerId": "reader-b",
                "tagId": "training-tag-001",
                "readCount": 1,
                "confidence": 0.8,
                "policyState": "review_needed"
            }],
            "locationFixes": [],
            "droneObservations": [],
            "controlSourceEstimates": [],
            "counterUasCues": [{
                "id": "cue-test-001",
                "droneObservationIds": [],
                "evidence": [],
                "confidence": 0.5,
                "policyGate": "review_needed",
                "acknowledgementState": "queued",
                "recommendedNextChecks": ["Confirm with another node."],
                "createdAt": "2026-05-03T10:00:00.000Z",
                "updatedAt": "2026-05-03T10:00:00.000Z"
            }],
            "nodeHealth": [],
            "filteringDecision": "summarize_first",
            "priority": 80
        })
    }

    #[test]
    fn stores_signed_encrypted_bundle() {
        let state = test_state();
        let record = store_bundle(&state, sample_bundle()).unwrap();
        assert_eq!(record.record_id, "bundle:bundle-test-001");
        assert_eq!(record.encrypted_at_rest, true);
        assert_eq!(record.ack_count, 0);

        let loaded = load_record_with_payload(&state, &record.record_id)
            .unwrap()
            .unwrap();
        assert_eq!(loaded.payload["id"], "bundle-test-001");

        let db = state.db.lock().unwrap();
        let ciphertext: String = db
            .query_row(
                "select payload_ciphertext from records where record_id = ?1",
                [&record.record_id],
                |row| row.get(0),
            )
            .unwrap();
        assert!(!ciphertext.contains("bundle-test-001"));
    }

    #[test]
    fn signature_verifies_against_record_preimage() {
        let state = test_state();
        let record = store_bundle(&state, sample_bundle()).unwrap();
        let preimage = RecordPreimage {
            record_id: record.record_id,
            mission_id: record.mission_id,
            source_node_id: record.source_node_id,
            producer_node_id: record.producer_node_id,
            created_at: record.created_at,
            received_at: record.received_at,
            policy_state: record.policy_state,
            content_hash: record.content_hash,
        };
        let signature_bytes = hex::decode(record.signature).unwrap();
        let signature = Signature::from_slice(&signature_bytes).unwrap();
        state
            .signing
            .key
            .verifying_key()
            .verify(preimage.as_string().as_bytes(), &signature)
            .unwrap();
    }

    #[test]
    fn duplicate_record_is_idempotent() {
        let state = test_state();
        let first = store_bundle(&state, sample_bundle()).unwrap();
        let second = store_bundle(&state, sample_bundle()).unwrap();
        assert_eq!(first.content_hash, second.content_hash);
        let db = state.db.lock().unwrap();
        assert_eq!(count_records(&db).unwrap(), 1);
    }
}
