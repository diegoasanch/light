#![no_std]
#![no_main]

use defmt::*;
use embassy_executor::Spawner;
use embassy_rp::peripherals::PIO0;
use embassy_sync::{blocking_mutex::raw::ThreadModeRawMutex, mutex::Mutex};
use embassy_time::Timer;
use smart_leds::RGB8;
use {defmt_rtt as _, panic_probe as _};

use firmware::{
    argb::Argb,
    rotary_encoder::{Direction, RotaryEncoder},
};

const NUM_LEDS: usize = 64;
const NUM_COLORS: usize = 4;
const COLORS: [RGB8; NUM_COLORS] = [
    RGB8::new(255, 0, 0),     // Red
    RGB8::new(0, 255, 0),     // Green
    RGB8::new(0, 0, 255),     // Blue
    RGB8::new(255, 255, 255), // White
];

// Shared ARGB LED controller using Mutex
type ArgbType = Mutex<ThreadModeRawMutex, Option<Argb<'static, PIO0, NUM_LEDS>>>;
static ARGB_LED: ArgbType = Mutex::new(None);

// Shared brightness value
type BrightnessType = Mutex<ThreadModeRawMutex, f32>;
static BRIGHTNESS: BrightnessType = Mutex::new(0.1); // Start at 10% brightness

#[embassy_executor::main]
async fn main(spawner: Spawner) {
    info!("Starting LED Brightness Control with Rotary Encoder");
    let p = embassy_rp::init(Default::default());

    // Initialize ARGB LED controller
    let argb = Argb::<PIO0, NUM_LEDS>::new(p.PIN_20, p.PIO0, p.DMA_CH0);

    // Initialize rotary encoder
    let encoder = RotaryEncoder::new(p.PIN_12.into(), p.PIN_13.into());

    // Store the ARGB controller in the global mutex
    {
        *(ARGB_LED.lock().await) = Some(argb);
    }

    info!("ARGB LED: Initialized with {} LEDs", NUM_LEDS);
    info!("Rotary Encoder: Initialized on GPIO pins 12 (A) and 13 (B)");
    info!("Controls: Clockwise = Increase brightness, Counter-clockwise = Decrease brightness");
    info!("Brightness range: 0.0 (off) to 1.0 (full brightness)");

    // Spawn tasks
    spawner.spawn(led_display_task()).unwrap();
    spawner.spawn(encoder_task(encoder)).unwrap();
}

/// Task that displays the LED pattern and applies brightness changes
#[embassy_executor::task]
async fn led_display_task() {
    let mut led_data = [RGB8::default(); NUM_LEDS];
    let mut pattern_offset = 0;

    loop {
        // Get current brightness
        let current_brightness = *BRIGHTNESS.lock().await;

        // Create a shifting color pattern
        for j in 0..NUM_LEDS {
            let color_index = (pattern_offset + j) % NUM_COLORS;
            led_data[j] = COLORS[color_index];
        }

        // Update LED display with current brightness
        {
            let mut argb_guard = ARGB_LED.lock().await;
            if let Some(argb) = argb_guard.as_mut() {
                argb.set_brightness(current_brightness);
                argb.write(&led_data).await;
            }
        }

        // Log current brightness
        info!("LED Brightness: {}%", (current_brightness * 100.0) as u8);

        // Wait before next update
        Timer::after_millis(100).await;

        // Advance pattern
        pattern_offset += 1;
    }
}

/// Task that monitors rotary encoder and adjusts brightness
#[embassy_executor::task]
async fn encoder_task(mut encoder: RotaryEncoder<'static>) {
    const BRIGHTNESS_STEP: f32 = 0.01; // 1% steps
    const MIN_BRIGHTNESS: f32 = 0.0;
    const MAX_BRIGHTNESS: f32 = 1.0;

    info!("Encoder task: Waiting for rotation events...");

    loop {
        let direction = encoder.wait_for_rotation().await;

        // Update brightness based on encoder direction
        let mut brightness_guard = BRIGHTNESS.lock().await;
        let current_brightness = *brightness_guard;

        let new_brightness = match direction {
            Direction::Clockwise => {
                let new = current_brightness + BRIGHTNESS_STEP;
                new.min(MAX_BRIGHTNESS)
            }
            Direction::CounterClockwise => {
                let new = current_brightness - BRIGHTNESS_STEP;
                new.max(MIN_BRIGHTNESS)
            }
        };

        *brightness_guard = new_brightness;

        // Log the change
        match direction {
            Direction::Clockwise => {
                info!(
                    "Encoder: Clockwise rotation - Brightness increased to {}%",
                    (new_brightness * 100.0) as u8
                );
            }
            Direction::CounterClockwise => {
                info!(
                    "Encoder: Counter-clockwise rotation - Brightness decreased to {}%",
                    (new_brightness * 100.0) as u8
                );
            }
        }
    }
}
