//! Rotary Encoder Module
//!
//! This module provides a high-level interface for reading rotary encoders.
//! Rotary encoders are input devices that can detect rotation direction and amount.
//! They typically have two output pins (A and B) that produce quadrature signals.
//!
//! # How it works
//! The encoder produces two square wave signals (A and B) that are 90 degrees out of phase.
//! By monitoring the sequence of state changes on both pins, we can determine:
//! - Direction of rotation (clockwise or counter-clockwise)
//! - Amount of rotation (number of detents)
//!
//! # Example
//! ```rust
//! use firmware::rotary_encoder::{RotaryEncoder, Direction};
//!
//! #[embassy_executor::main]
//! async fn main(_spawner: Spawner) {
//!     let p = embassy_rp::init(Default::default());
//!     let mut encoder = RotaryEncoder::new(p.PIN_12, p.PIN_13);
//!     
//!     loop {
//!         match encoder.wait_for_rotation().await {
//!             Direction::Clockwise => info!("Rotated clockwise"),
//!             Direction::CounterClockwise => info!("Rotated counter-clockwise"),
//!         }
//!     }
//! }
//! ```

use defmt::{error, info};
use embassy_futures::select::{Either, Either3, select, select3};
use embassy_rp::gpio::{AnyPin, Input, Pull};
use embassy_time::{Duration, Instant, Timer};

/// Direction of rotation for the rotary encoder
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Direction {
    /// Clockwise rotation
    Clockwise,
    /// Counter-clockwise rotation
    CounterClockwise,
}

/// Numeric representation of the A and B pins
/// - A: 0, B: 0 -> S0
/// - A: 0, B: 1 -> S1
/// - A: 1, B: 0 -> S2
/// - A: 1, B: 1 -> S3
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EncoderState {
    S0 = 0,
    S1 = 1,
    S2 = 2,
    S3 = 3,
}

impl From<u8> for EncoderState {
    fn from(value: u8) -> Self {
        match value {
            0 => EncoderState::S0,
            1 => EncoderState::S1,
            2 => EncoderState::S2,
            3 => EncoderState::S3,
            _ => panic!("Invalid EncoderState value: {}", value),
        }
    }
}

/// Rotary encoder controller
///
/// This struct provides a high-level interface for reading rotary encoders.
/// It monitors two GPIO pins (A and B) and detects rotation direction by
/// analyzing the quadrature signal sequence.
pub struct RotaryEncoder<'d> {
    pin_a: Input<'d>,
    pin_b: Input<'d>,
    last_state: EncoderState,
}

impl<'d> RotaryEncoder<'d> {
    /// Creates a new rotary encoder controller
    ///
    /// # Arguments
    /// * `pin_a` - GPIO pin connected to encoder output A
    /// * `pin_b` - GPIO pin connected to encoder output B
    ///
    /// # Returns
    /// A new `RotaryEncoder` controller configured with pull-up resistors
    pub fn new(pin_a: embassy_rp::Peri<'d, AnyPin>, pin_b: embassy_rp::Peri<'d, AnyPin>) -> Self {
        let pin_a = Input::new(pin_a, Pull::Up);
        let pin_b = Input::new(pin_b, Pull::Up);

        // Read initial state
        let a_state = if pin_a.is_high() { 1 } else { 0 };
        let b_state = if pin_b.is_high() { 2 } else { 0 };
        let last_state_bin = a_state | b_state;
        let last_state = EncoderState::from(last_state_bin);

        Self {
            pin_a,
            pin_b,
            last_state,
        }
    }

    /// Waits for a rotation event and returns the direction
    ///
    /// This method blocks until a valid rotation is detected.
    /// It groups fast consecutive edges (a "cluster") and returns the majority
    /// direction inside that cluster. This smooths out occasional invalid or
    /// inverted transitions produced by the mechanical encoder.
    pub async fn wait_for_rotation(&mut self) -> Direction {
        // Single-loop, time-based clustering. A cluster is a fixed 15ms window
        // anchored at the first edge; we report the majority of valid
        // transitions seen within that window, exactly once.
        const CLUSTER_SPAN: Duration = Duration::from_millis(15);

        let mut cluster_active = false;
        let mut cluster_deadline = Instant::now();
        let mut cw_votes: u8 = 0;
        let mut ccw_votes: u8 = 0;

        loop {
            if cluster_active {
                // While a cluster is active, wait for either another edge or the deadline.
                match select3(
                    self.pin_a.wait_for_any_edge(),
                    self.pin_b.wait_for_any_edge(),
                    Timer::at(cluster_deadline),
                )
                .await
                {
                    // More edges within the window – accumulate votes.
                    Either3::First(_) | Either3::Second(_) => {
                        let current_state = self.get_state();
                        if let Some(dir) = self.decode_direction(self.last_state, current_state) {
                            match dir {
                                Direction::Clockwise => cw_votes = cw_votes.saturating_add(1),
                                Direction::CounterClockwise => ccw_votes = ccw_votes.saturating_add(1),
                            }
                        }
                        self.last_state = current_state;
                        continue;
                    }
                    // Window elapsed – emit result once and exit.
                    Either3::Third(_) => {
                        let result = if cw_votes >= ccw_votes {
                            Direction::Clockwise
                        } else {
                            Direction::CounterClockwise
                        };
                        // Reset cluster state before returning
                        cluster_active = false;
                        return result;
                    }
                }
            } else {
                // Idle: wait for first edge to start a cluster.
                match select(self.pin_a.wait_for_any_edge(), self.pin_b.wait_for_any_edge()).await {
                    Either::First(_) | Either::Second(_) => {
                        // Anchor the cluster window to this first edge.
                        cluster_active = true;
                        cluster_deadline = Instant::now() + CLUSTER_SPAN;
                        cw_votes = 0;
                        ccw_votes = 0;

                        // Count initial transition if valid.
                        let current_state = self.get_state();
                        if let Some(dir) = self.decode_direction(self.last_state, current_state) {
                            match dir {
                                Direction::Clockwise => cw_votes = cw_votes.saturating_add(1),
                                Direction::CounterClockwise => ccw_votes = ccw_votes.saturating_add(1),
                            }
                        }
                        self.last_state = current_state;
                        continue;
                    }
                }
            }
        }
    }

    /// Decodes rotation direction from state transitions
    ///
    /// This method implements quadrature decoding logic to determine
    /// the direction of rotation based on the sequence of pin state changes.
    ///
    /// # Returns
    /// `Some(Direction)` if a valid rotation was detected, `None` otherwise
    fn decode_direction(
        &self,
        old_state: EncoderState,
        new_state: EncoderState,
    ) -> Option<Direction> {
        match old_state {
            EncoderState::S0 => match new_state {
                EncoderState::S1 => Some(Direction::Clockwise),
                EncoderState::S2 => Some(Direction::CounterClockwise),
                _ => None,
            },
            EncoderState::S1 => match new_state {
                EncoderState::S0 => Some(Direction::CounterClockwise),
                EncoderState::S3 => Some(Direction::Clockwise),
                _ => None,
            },
            EncoderState::S2 => match new_state {
                EncoderState::S0 => Some(Direction::Clockwise),
                EncoderState::S3 => Some(Direction::CounterClockwise),
                _ => None,
            },
            EncoderState::S3 => match new_state {
                EncoderState::S1 => Some(Direction::CounterClockwise),
                EncoderState::S2 => Some(Direction::Clockwise),
                _ => None,
            },
        }
    }

    /// Gets the current state of the encoder
    pub fn get_state(&self) -> EncoderState {
        let a_state = if self.pin_a.is_high() { 1 } else { 0 };
        let b_state = if self.pin_b.is_high() { 2 } else { 0 };
        let last_state_bin = a_state | b_state;
        EncoderState::from(last_state_bin)
    }
}
