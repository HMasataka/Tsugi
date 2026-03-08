use std::sync::atomic::{AtomicU32, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

static COUNTER: AtomicU32 = AtomicU32::new(0);

pub fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

pub fn generate_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let seq = COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{:032x}-{:04x}", nanos, seq)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn now_millis_returns_positive_value() {
        let ms = now_millis();
        assert!(ms > 0);
    }

    #[test]
    fn generate_id_produces_unique_ids() {
        let id1 = generate_id();
        let id2 = generate_id();
        assert_ne!(id1, id2);
    }

    #[test]
    fn generate_id_format_is_consistent() {
        let id = generate_id();
        let parts: Vec<&str> = id.split('-').collect();
        assert_eq!(parts.len(), 2);
        assert_eq!(parts[0].len(), 32);
        assert_eq!(parts[1].len(), 4);
    }
}
