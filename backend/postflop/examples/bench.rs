//! 브라우저와 같은 조건(스레드 하나)으로 플랍 하나를 풀어 시간과 메모리를 잰다.
//!   cargo run --release --example bench ["플랍|턴|리버" 베팅 사이즈] [레이즈 사이즈] [압축 0|1]
use banwonpoker_postflop::{ReportRequest, Spot, SpotConfig};
use std::time::Instant;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let bet = args.get(1).cloned().unwrap_or("33%|75%|75%".into());
    let raise = args.get(2).cloned().unwrap_or("a".into());
    let streets: Vec<String> = bet.split('|').map(|s| s.to_string()).collect();
    let street = |i: usize| streets.get(i).or(streets.last()).cloned().unwrap();
    let compress = args.get(3).map(|v| v == "1").unwrap_or(false);
    // BTN 오픈 대 BB 콜, 100BB(빅 블라인드 100칩)
    let config = SpotConfig {
        oop_range: "99-22,ATs-A2s,AJo-A9o,KJs-K5s,KQo-KTo,QJs-Q8s,QJo-QTo,JTs-J8s,JTo,T9s-T7s,98s-96s,87s-85s,76s-75s,65s-64s,54s".into(),
        ip_range: "22+,A2s+,A7o+,K6s+,KTo+,Q8s+,QTo+,J8s+,JTo,T7s+,T9o,97s+,86s+,75s+,65s,54s".into(),
        flop: "Td9d6h".into(),
        starting_pot: 550,
        effective_stack: 9750,
        flop_bets: street(0),
        turn_bets: street(1),
        river_bets: street(2),
        raises: raise.clone(),
        compress,
    };
    let started = Instant::now();
    let mut spot = Spot::new(&config).expect("spot");
    let (raw, packed) = spot.memory_usage();
    println!("tree {bet} / {raise} · memory {:.0}MB (compressed {:.0}MB) · build {:?}", raw as f64 / 1048576.0, packed as f64 / 1048576.0, started.elapsed());
    if std::env::var("MEMORY_ONLY").is_ok() {
        return;
    }
    let target = 550.0 * 0.005;
    let solving = Instant::now();
    loop {
        let exploitability = spot.step(10);
        println!("  {} iterations · exploitability {:.2}% pot · {:?}", spot.iterations(), exploitability / 550.0 * 100.0, solving.elapsed());
        if exploitability <= target || spot.iterations() >= 400 {
            break;
        }
    }
    let report = spot
        .report(&ReportRequest { path: vec![], hand: "AhAc".into() })
        .expect("report");
    println!("OOP AA at root: {:?} -> {:?}", report.actions.iter().map(|a| (a.kind, a.amount)).collect::<Vec<_>>(), report.strategy);
}
