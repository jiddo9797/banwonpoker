//! banwonpoker 헤즈업 포스트플랍 분석.
//!
//! b-inary/postflop-solver(AGPL-3.0-or-later)로 플랍부터 리버까지 한 핸드를 풀고,
//! 복기에서 실제로 오간 행동을 따라 내려가 그 결정 지점의 전략과 EV를 돌려준다.
//! 화면(Web Worker)과는 JSON 문자열로 주고받는다.

use postflop_solver::{
    card_from_str, compute_exploitability, finalize, flop_from_str, solve_step, Action, ActionTree, BetSizeOptions,
    BoardState, CardConfig, PostFlopGame, Range, TreeConfig, NOT_DEALT,
};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

/// 멀티스레드 빌드에서 Web Worker 스레드 풀을 만든다. JS에서 `initThreadPool(n)`으로 부른다.
#[cfg(feature = "threads")]
pub use wasm_bindgen_rayon::init_thread_pool;

/// 풀 상황. 금액은 모두 게임 칩 단위다.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpotConfig {
    /// OOP(플랍에서 먼저 행동) 레인지. 예: `"AA,AKs:0.5,QQ"`
    pub oop_range: String,
    /// IP 레인지
    pub ip_range: String,
    /// 플랍 세 장. 예: `"Td9d6h"`
    pub flop: String,
    pub starting_pot: i32,
    pub effective_stack: i32,
    /// 스트리트별 베팅 사이즈. 예: `"33%"`, `"33%, 75%"`
    pub flop_bets: String,
    pub turn_bets: String,
    pub river_bets: String,
    /// 레이즈 사이즈. 예: `"a"`(올인만), `"2.5x"`
    pub raises: String,
    /// 16비트로 압축해 메모리를 절반으로 줄인다.
    #[serde(default)]
    pub compress: bool,
}

/// 실제로 오간 포스트플랍 행동 하나 또는 새로 깔린 카드
#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PathStep {
    /// `check` `bet` `call` `fold` `raise` `allin` `deal`
    pub kind: String,
    /// 베팅·레이즈·올인: 이 스트리트에 낸 총액
    #[serde(default)]
    pub amount: Option<i32>,
    /// deal: 카드. 예: `"Qc"`
    #[serde(default)]
    pub card: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportRequest {
    pub path: Vec<PathStep>,
    /// 결정하는 사람의 홀카드. 예: `"QhJh"`
    pub hand: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ActionView {
    pub kind: &'static str,
    pub amount: i32,
}

/// 실제 행동을 트리의 어느 행동으로 봤는지
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Mapping {
    pub real: ActionView,
    pub chosen: ActionView,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    /// 0: OOP, 1: IP
    pub player: usize,
    pub actions: Vec<ActionView>,
    /// 이 핸드의 행동별 빈도
    pub strategy: Vec<f32>,
    /// 이 핸드의 행동별 EV(칩)
    pub evs: Vec<f32>,
    /// 이 핸드의 승률(0~1)
    pub equity: f32,
    /// 이 핸드가 레인지에 남아 있는 정도(0이면 여기까지 오지 않음)
    pub weight: f32,
    /// 레인지 전체의 행동별 빈도
    pub range_strategy: Vec<f32>,
    /// 지금 팟(칩)
    pub pot: i32,
    pub board: Vec<String>,
    pub mappings: Vec<Mapping>,
}

fn view(action: &Action) -> ActionView {
    match *action {
        Action::Fold => ActionView { kind: "fold", amount: 0 },
        Action::Check => ActionView { kind: "check", amount: 0 },
        Action::Call => ActionView { kind: "call", amount: 0 },
        Action::Bet(amount) => ActionView { kind: "bet", amount },
        Action::Raise(amount) => ActionView { kind: "raise", amount },
        Action::AllIn(amount) => ActionView { kind: "allin", amount },
        _ => ActionView { kind: "none", amount: 0 },
    }
}

fn card_name(card: u8) -> String {
    const RANKS: &[u8] = b"23456789TJQKA";
    const SUITS: &[u8] = b"cdhs";
    format!("{}{}", RANKS[(card >> 2) as usize] as char, SUITS[(card & 3) as usize] as char)
}

/// 실제 행동에 가장 가까운 트리 행동을 고른다.
fn choose(actions: &[Action], step: &PathStep) -> Result<usize, String> {
    let find = |wanted: fn(&Action) -> bool| actions.iter().position(wanted);
    match step.kind.as_str() {
        "fold" => find(|a| matches!(a, Action::Fold)).ok_or_else(|| "폴드할 수 없는 지점입니다.".into()),
        "check" => find(|a| matches!(a, Action::Check)).ok_or_else(|| "체크할 수 없는 지점입니다.".into()),
        "call" => find(|a| matches!(a, Action::Call)).ok_or_else(|| "콜할 수 없는 지점입니다.".into()),
        "bet" | "raise" | "allin" => {
            let real = step.amount.unwrap_or(0);
            let sized: Vec<(usize, i32)> = actions
                .iter()
                .enumerate()
                .filter_map(|(i, a)| match *a {
                    Action::Bet(x) | Action::Raise(x) | Action::AllIn(x) => Some((i, x)),
                    _ => None,
                })
                .collect();
            if step.kind == "allin" {
                if let Some(i) = find(|a| matches!(a, Action::AllIn(_))) {
                    return Ok(i);
                }
            }
            sized
                .into_iter()
                .min_by_key(|&(_, x)| (x - real).abs())
                .map(|(i, _)| i)
                .ok_or_else(|| "베팅할 수 없는 지점입니다.".into())
        }
        other => Err(format!("알 수 없는 행동: {other}")),
    }
}

fn parse_hand(hand: &str) -> Result<(u8, u8), String> {
    if hand.len() != 4 {
        return Err(format!("홀카드 형식이 아닙니다: {hand}"));
    }
    let a = card_from_str(&hand[0..2])?;
    let b = card_from_str(&hand[2..4])?;
    Ok(if a < b { (a, b) } else { (b, a) })
}

pub struct Spot {
    game: PostFlopGame,
    iteration: u32,
    solved: bool,
}

impl Spot {
    pub fn new(config: &SpotConfig) -> Result<Spot, String> {
        let oop: Range = config.oop_range.parse()?;
        let ip: Range = config.ip_range.parse()?;
        let card_config = CardConfig {
            range: [oop, ip],
            flop: flop_from_str(&config.flop)?,
            turn: NOT_DEALT,
            river: NOT_DEALT,
        };
        let sizes = |bets: &str| BetSizeOptions::try_from((bets, config.raises.as_str()));
        let (flop, turn, river) = (sizes(&config.flop_bets)?, sizes(&config.turn_bets)?, sizes(&config.river_bets)?);
        let tree_config = TreeConfig {
            initial_state: BoardState::Flop,
            starting_pot: config.starting_pot,
            effective_stack: config.effective_stack,
            rake_rate: 0.0,
            rake_cap: 0.0,
            flop_bet_sizes: [flop.clone(), flop],
            turn_bet_sizes: [turn.clone(), turn],
            river_bet_sizes: [river.clone(), river],
            turn_donk_sizes: None,
            river_donk_sizes: None,
            add_allin_threshold: 1.5,
            force_allin_threshold: 0.15,
            merging_threshold: 0.1,
        };
        let tree = ActionTree::new(tree_config)?;
        let mut game = PostFlopGame::with_config(card_config, tree)?;
        game.allocate_memory(config.compress);
        Ok(Spot { game, iteration: 0, solved: false })
    }

    /// 압축하지 않았을 때와 압축했을 때의 메모리(바이트)
    pub fn memory_usage(&self) -> (u64, u64) {
        self.game.memory_usage()
    }

    /// 반복을 count번 더 돌린다.
    pub fn run(&mut self, count: u32) {
        for _ in 0..count {
            solve_step(&self.game, self.iteration);
            self.iteration += 1;
        }
    }

    /// 지금 평균 전략의 균형 오차(칩). 반복 한두 번만큼 걸린다.
    pub fn exploitability(&self) -> f32 {
        compute_exploitability(&self.game)
    }

    /// 반복을 count번 더 돌리고 지금의 균형 오차(칩)를 돌려준다.
    pub fn step(&mut self, count: u32) -> f32 {
        self.run(count);
        self.exploitability()
    }

    pub fn iterations(&self) -> u32 {
        self.iteration
    }

    pub fn starting_pot(&self) -> i32 {
        self.game.tree_config().starting_pot
    }

    /// 실제 행동을 따라 내려가 그 결정 지점의 전략을 돌려준다.
    pub fn report(&mut self, request: &ReportRequest) -> Result<Report, String> {
        if !self.solved {
            finalize(&mut self.game);
            self.solved = true;
        }
        let game = &mut self.game;
        game.back_to_root();
        let mut mappings = Vec::new();
        for step in &request.path {
            if game.is_terminal_node() {
                return Err("이미 끝난 핸드입니다.".into());
            }
            if step.kind == "deal" {
                if !game.is_chance_node() {
                    return Err("카드가 깔릴 차례가 아닙니다.".into());
                }
                let card = card_from_str(step.card.as_deref().unwrap_or(""))?;
                if game.possible_cards() & (1u64 << card) == 0 {
                    return Err(format!("깔 수 없는 카드입니다: {}", card_name(card)));
                }
                game.play(card as usize);
                continue;
            }
            if game.is_chance_node() {
                return Err("다음 카드 기록이 빠져 있습니다.".into());
            }
            let actions = game.available_actions();
            let index = choose(&actions, step)?;
            let real = ActionView {
                kind: match step.kind.as_str() {
                    "bet" => "bet",
                    "raise" => "raise",
                    "allin" => "allin",
                    "call" => "call",
                    "check" => "check",
                    _ => "fold",
                },
                amount: step.amount.unwrap_or(0),
            };
            mappings.push(Mapping { real, chosen: view(&actions[index]) });
            game.play(index);
        }
        if game.is_terminal_node() || game.is_chance_node() {
            return Err("결정 지점이 아닙니다.".into());
        }

        game.cache_normalized_weights();
        let player = game.current_player();
        let actions = game.available_actions();
        let hands = game.private_cards(player);
        let count = hands.len();
        let (a, b) = parse_hand(&request.hand)?;
        let hand_index = hands.iter().position(|&(x, y)| (x.min(y), x.max(y)) == (a, b));
        let strategy = game.strategy();
        let evs = game.expected_values_detail(player);
        let equity = game.equity(player);
        let weights = game.normalized_weights(player).to_vec();

        let total_weight: f32 = weights.iter().sum();
        let range_strategy = (0..actions.len())
            .map(|k| {
                if total_weight <= 0.0 {
                    return 0.0;
                }
                (0..count).map(|h| strategy[k * count + h] * weights[h]).sum::<f32>() / total_weight
            })
            .collect();
        let bets = game.total_bet_amount();
        let pot = game.tree_config().starting_pot + bets[0] + bets[1];
        let board = game.current_board().into_iter().map(card_name).collect();

        let (strategy_of_hand, evs_of_hand, equity_of_hand, weight) = match hand_index {
            Some(h) => (
                (0..actions.len()).map(|k| strategy[k * count + h]).collect(),
                (0..actions.len()).map(|k| evs[k * count + h]).collect(),
                equity[h],
                weights[h],
            ),
            // 보드와 겹치는 등 레인지에 없는 핸드
            None => (vec![0.0; actions.len()], vec![0.0; actions.len()], 0.0, 0.0),
        };

        Ok(Report {
            player,
            actions: actions.iter().map(view).collect(),
            strategy: strategy_of_hand,
            evs: evs_of_hand,
            equity: equity_of_hand,
            weight,
            range_strategy,
            pot,
            board,
            mappings,
        })
    }
}

/// 브라우저(Web Worker)에서 쓰는 감싸개
#[wasm_bindgen]
pub struct WasmSpot {
    inner: Spot,
}

#[wasm_bindgen]
impl WasmSpot {
    #[wasm_bindgen(constructor)]
    pub fn new(config_json: &str) -> Result<WasmSpot, JsError> {
        let config: SpotConfig = serde_json::from_str(config_json).map_err(|e| JsError::new(&e.to_string()))?;
        Spot::new(&config).map(|inner| WasmSpot { inner }).map_err(|e| JsError::new(&e))
    }

    /// 실제로 잡은 메모리(바이트)
    pub fn memory_bytes(&self, compressed: bool) -> f64 {
        let (raw, packed) = self.inner.memory_usage();
        (if compressed { packed } else { raw }) as f64
    }

    pub fn run(&mut self, count: u32) {
        self.inner.run(count)
    }

    pub fn exploitability(&self) -> f32 {
        self.inner.exploitability()
    }

    pub fn step(&mut self, count: u32) -> f32 {
        self.inner.step(count)
    }

    pub fn iterations(&self) -> u32 {
        self.inner.iterations()
    }

    pub fn starting_pot(&self) -> i32 {
        self.inner.starting_pot()
    }

    pub fn report(&mut self, request_json: &str) -> Result<String, JsError> {
        let request: ReportRequest = serde_json::from_str(request_json).map_err(|e| JsError::new(&e.to_string()))?;
        let report = self.inner.report(&request).map_err(|e| JsError::new(&e))?;
        serde_json::to_string(&report).map_err(|e| JsError::new(&e.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn small_spot() -> Spot {
        // 레인지를 좁혀 빨리 푼다.
        Spot::new(&SpotConfig {
            oop_range: "AA,KK,QQ,AKs,76s".into(),
            ip_range: "JJ,TT,AQs,KQs,98s".into(),
            flop: "Ks7h2c".into(),
            starting_pot: 600,
            effective_stack: 9700,
            flop_bets: "33%".into(),
            turn_bets: "75%".into(),
            river_bets: "75%".into(),
            raises: "a".into(),
            compress: false,
        })
        .unwrap()
    }

    fn step(kind: &str, amount: Option<i32>) -> PathStep {
        PathStep { kind: kind.into(), amount, card: None }
    }

    #[test]
    fn 실제_행동을_따라_내려가_가장_가까운_사이즈로_본다() {
        let mut spot = small_spot();
        assert!(spot.step(50) < 600.0 * 0.05);
        // OOP 체크, IP가 250(트리에는 33% = 198)을 베팅
        let report = spot
            .report(&ReportRequest { path: vec![step("check", None), step("bet", Some(250))], hand: "AhAd".into() })
            .unwrap();
        assert_eq!(report.player, 0);
        assert_eq!(report.mappings[1].real.amount, 250);
        assert_eq!(report.mappings[1].chosen.kind, "bet");
        assert_eq!(report.mappings[1].chosen.amount, 198);
        assert_eq!(report.actions.iter().map(|a| a.kind).collect::<Vec<_>>(), ["fold", "call", "allin"]);
        let total: f32 = report.strategy.iter().sum();
        assert!((total - 1.0).abs() < 1e-3);
        // 오버페어 AA는 33% 베팅에 폴드하지 않는다(체크한 레인지에 AA가 남아 있을 때).
        if report.weight > 0.0 {
            assert!(report.strategy[0] < 0.01);
        }
        assert_eq!(report.pot, 600 + 198);
    }

    #[test]
    fn 턴_카드를_깔고_다음_스트리트로_간다() {
        let mut spot = small_spot();
        spot.step(20);
        let path = vec![
            step("check", None),
            step("check", None),
            PathStep { kind: "deal".into(), amount: None, card: Some("3d".into()) },
        ];
        let report = spot.report(&ReportRequest { path, hand: "QsQd".into() }).unwrap();
        // 플랍은 낮은 카드부터 정렬되어 있다.
        assert_eq!(report.board, ["2c", "7h", "Ks", "3d"]);
        assert_eq!(report.player, 0);
    }

    #[test]
    fn 맞지_않는_기록은_이유와_함께_거절한다() {
        let mut spot = small_spot();
        spot.step(5);
        let early_deal = vec![PathStep { kind: "deal".into(), amount: None, card: Some("3d".into()) }];
        assert!(spot.report(&ReportRequest { path: early_deal, hand: "AhAd".into() }).is_err());
        let missing_card = vec![step("check", None), step("check", None), step("check", None)];
        assert!(spot.report(&ReportRequest { path: missing_card, hand: "AhAd".into() }).is_err());
        // 보드와 겹치는 핸드는 레인지에 없다.
        let report = spot.report(&ReportRequest { path: vec![], hand: "KsKd".into() }).unwrap();
        assert_eq!(report.weight, 0.0);
    }
}
