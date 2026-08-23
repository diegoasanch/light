#![no_std]
#![no_main]

use defmt::*;
use embassy_executor::Spawner;
use embassy_rp::peripherals::{DMA_CH0, PIO0};
use embassy_rp::pio::InterruptHandler;
use embassy_rp::{bind_interrupts, dma};
use embassy_sync::{blocking_mutex::raw::ThreadModeRawMutex, channel::Channel, mutex::Mutex};
use embassy_time::{Duration, Ticker};
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

#[derive(Debug, Clone, Copy)]
pub enum EncoderMessage {
    Clockwise,
    CounterClockwise,
}

// Shared ARGB LED controller using Mutex
type ArgbType = Mutex<ThreadModeRawMutex, Option<Argb<'static, PIO0, NUM_LEDS>>>;
static ARGB_LED: ArgbType = Mutex::new(None);

// Shared brightness value
type BrightnessType = Mutex<ThreadModeRawMutex, f32>;
static BRIGHTNESS: BrightnessType = Mutex::new(0.1); // Start at 10% brightness

// Shared channel for encoder-brightness communication
static ENCODER_CHANNEL: Channel<ThreadModeRawMutex, EncoderMessage, 8> = Channel::new();

bind_interrupts!(struct Irqs {
    PIO0_IRQ_0 => InterruptHandler<PIO0>;
    DMA_IRQ_0 => dma::InterruptHandler<DMA_CH0>;
});

#[embassy_executor::main]
async fn main(spawner: Spawner) {
    info!("Starting LED Brightness Control with Rotary Encoder");
    let p = embassy_rp::init(Default::default());

    let argb = Argb::<PIO0, NUM_LEDS>::new(p.PIN_20, p.PIO0, p.DMA_CH0, Irqs);
    let encoder = RotaryEncoder::new(p.PIN_12.into(), p.PIN_13.into());

    {
        *(ARGB_LED.lock().await) = Some(argb);
    }

    info!("ARGB LED: Initialized with {} LEDs", NUM_LEDS);
    info!("Rotary Encoder: Initialized on GPIO pins 12 (A) and 13 (B)");
    info!("Controls: Clockwise = Increase brightness, Counter-clockwise = Decrease brightness");

    spawner.spawn(unwrap!(led_display_task()));
    spawner.spawn(unwrap!(encoder_task(encoder)));
    spawner.spawn(unwrap!(brightness_control_task()));
}

/// Task that displays the LED pattern and applies brightness changes
#[embassy_executor::task]
async fn led_display_task() {
    let mut led_data = [RGB8::default(); NUM_LEDS];
    let mut pattern_offset = 0;
    let mut ticker = Ticker::every(Duration::from_millis(100));

    loop {
        // Get current brightness
        let current_brightness = *BRIGHTNESS.lock().await;

        // Create a shifting color pattern
        for j in 0..NUM_LEDS {
            let color_index = (pattern_offset + j) % NUM_COLORS;
            led_data[j] = COLORS[color_index];
        }

        // Update LED display with current brightness
        let mut argb_guard = ARGB_LED.lock().await;
        if let Some(argb) = argb_guard.as_mut() {
            argb.set_brightness(current_brightness);
            argb.write(&led_data).await;
        }

        pattern_offset += 1;

        ticker.next().await;
    }
}

/// Task that monitors rotary encoder and sends updates through channel
#[embassy_executor::task]
async fn encoder_task(mut encoder: RotaryEncoder<'static>) {
    info!("Encoder task: Waiting for rotation events...");

    loop {
        let message = match encoder.wait_for_rotation().await {
            Direction::Clockwise => EncoderMessage::Clockwise,
            Direction::CounterClockwise => EncoderMessage::CounterClockwise,
        };
        ENCODER_CHANNEL.send(message).await;
    }
}

/// Task that receives encoder messages and updates brightness
#[embassy_executor::task]
async fn brightness_control_task() {
    const BRIGHTNESS_STEP: f32 = 0.01; // 1% steps
    const MIN_BRIGHTNESS: f32 = 0.0;
    const MAX_BRIGHTNESS: f32 = 1.0;

    info!("Brightness control task: Waiting for encoder messages...");

    loop {
        let message = ENCODER_CHANNEL.receive().await;

        let mut brightness_guard = BRIGHTNESS.lock().await;
        let current_brightness = *brightness_guard;

        let new_brightness = match message {
            EncoderMessage::Clockwise => {
                let new = current_brightness + BRIGHTNESS_STEP;
                new.min(MAX_BRIGHTNESS)
            }
            EncoderMessage::CounterClockwise => {
                let new = current_brightness - BRIGHTNESS_STEP;
                new.max(MIN_BRIGHTNESS)
            }
        };

        *brightness_guard = new_brightness;

        info!("brightness: {}%", (new_brightness * 100.0) as u8);
    }
}
