#![no_std]
#![no_main]

use defmt::*;
use embassy_executor::Spawner;
use embassy_rp::peripherals::{DMA_CH0, PIO0};
use embassy_rp::pio::InterruptHandler;
use embassy_rp::{bind_interrupts, dma};
use embassy_time::Timer;
use smart_leds::RGB8;
use {defmt_rtt as _, panic_probe as _};

use firmware::argb::Argb;

bind_interrupts!(struct Irqs {
    PIO0_IRQ_0 => InterruptHandler<PIO0>;
    DMA_IRQ_0 => dma::InterruptHandler<DMA_CH0>;
});

const NUM_LEDS: usize = 2; // Try changing this to any number: 1, 3, 10, 100, 1000, etc.
const NUM_COLORS: usize = 4;
const COLORS: [RGB8; NUM_COLORS] = [
    RGB8::new(255, 0, 0),
    RGB8::new(0, 255, 0),
    RGB8::new(0, 0, 255),
    RGB8::new(255, 255, 255),
];

#[embassy_executor::main]
async fn main(_spawner: Spawner) {
    info!("Starting WS2812 ARGB LED control example");
    let p = embassy_rp::init(Default::default());

    let mut led_data = [RGB8::default(); NUM_LEDS];

    // Use PIN_5 for the on-board LEDs
    let mut argb = Argb::<PIO0, NUM_LEDS>::new(p.PIN_5, p.PIO0, p.DMA_CH0, Irqs);

    // Set brightness to 5% (0.05)
    // argb.set_brightness(1.0);
    argb.set_brightness(0.25);

    info!("ARGB LED: Initialized with {} LEDs", argb.led_count());
    info!("LED pattern: Red, Green, Blue, Black, White");
    let mut i = 0;

    loop {
        // Create a shifting pattern where colors move through the LEDs
        for j in 0..NUM_LEDS {
            // Calculate which color should be at this LED position
            // The pattern shifts by one position each cycle
            let color_index = (i + j) % NUM_COLORS;
            led_data[j] = COLORS[color_index];
        }

        // Write the LED data (brightness is applied automatically)
        argb.write(&led_data).await;

        // Log the data being sent
        info!(
            "ARGB LED: Sent LED data - LED0 R:{} G:{} B:{}, LED1 R:{} G:{} B:{}",
            led_data[0].r,
            led_data[0].g,
            led_data[0].b,
            led_data[1].r,
            led_data[1].g,
            led_data[1].b
        );

        // Wait 300ms before sending again
        Timer::after_millis(300).await;

        i += 1;
    }
}
