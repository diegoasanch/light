#![no_std]
#![no_main]

use defmt::*;
use embassy_executor::Spawner;
use {defmt_rtt as _, panic_probe as _};

use firmware::rotary_encoder::{Direction, RotaryEncoder};

#[embassy_executor::main]
async fn main(_spawner: Spawner) {
    info!("Starting Rotary Encoder test - GPIO Pins 12 (A) and 13 (B)");

    // Initialize the RP2350
    let p = embassy_rp::init(Default::default());

    // Create rotary encoder on pins 12 and 13
    let mut encoder = RotaryEncoder::new(p.PIN_12.into(), p.PIN_13.into());

    info!("Rotary Encoder: Initialized on GPIO pins 12 (A) and 13 (B)");
    info!("Rotary Encoder: Waiting for rotation events...");
    info!("Rotary Encoder: Rotate the encoder to see direction detection");

    let mut rotation_count = 0i32;

    loop {
        // Wait for a rotation event
        let direction = encoder.wait_for_rotation().await;

        // Update rotation count
        match direction {
            Direction::Clockwise => {
                info!("Rotation #{}: CLOCKWISE", rotation_count);
            }
            Direction::CounterClockwise => {
                info!("Rotation #{}: COUNTER-CLOCKWISE", rotation_count);
            }
        }
        rotation_count += 1;
    }
}
