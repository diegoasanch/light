#![no_std]
#![no_main]

use defmt::*;
use embassy_executor::Spawner;
use embassy_rp::bind_interrupts;
use embassy_rp::peripherals::PIO0;
use embassy_rp::pio::{InterruptHandler, Pio};
use embassy_rp::pio_programs::ws2812::{PioWs2812, PioWs2812Program};
use embassy_time::Timer;
use smart_leds::{brightness, RGB8};
use {defmt_rtt as _, panic_probe as _};

bind_interrupts!(struct Irqs {
    PIO0_IRQ_0 => InterruptHandler<PIO0>;
});

const NUM_COLORS: usize = 5;
const COLORS: [RGB8; NUM_COLORS] = [
    RGB8::new(255, 0, 0),
    RGB8::new(0, 255, 0),
    RGB8::new(0, 0, 255),
    RGB8::new(0, 0, 0),
    RGB8::new(255, 255, 255),
];

#[embassy_executor::main]
async fn main(_spawner: Spawner) {
    info!("Starting WS2812 SPI-style control example");
    let p = embassy_rp::init(Default::default());

    let Pio { mut common, sm0, .. } = Pio::new(p.PIO0, Irqs);

    const NUM_LEDS: usize = 2;
    let mut led_data = [RGB8::default(); NUM_LEDS];

    // Initialize the WS2812 driver using PIO
    // Using PIN_5 for the on-board LEDs
    // You can change this to any available GPIO pin
    let program = PioWs2812Program::new(&mut common);
    let led_pin = p.PIN_5;
    let mut ws2812 = PioWs2812::new(&mut common, sm0, p.DMA_CH0, led_pin, &program);

    info!("WS2812: Initialized with {} LEDs", NUM_LEDS);
    info!("LED pattern: Red, Green, Blue, Black, White");
    let mut i = 0;
    let brightness_level = (255f32 * 0.05) as u8;

    loop {
        // cycle through the colors
        led_data[0] = COLORS[i % NUM_COLORS];
        led_data[1] = COLORS[(i + 1) % NUM_COLORS];
        
        // Apply brightness to the LED data
        let mut bright_led_data = [RGB8::default(); NUM_LEDS];
        for (i, bright_color) in brightness(led_data.iter().cloned(), brightness_level).enumerate() {
            bright_led_data[i] = bright_color;
        }
        
        ws2812.write(&bright_led_data).await;

        

        // Log the data being sent (similar to the original info! macro)
        info!("WS2812: Sent LED data - LED0 R:{} G:{} B:{}, LED1 R:{} G:{} B:{}", 
              bright_led_data[0].r, bright_led_data[0].g, bright_led_data[0].b,
              bright_led_data[1].r, bright_led_data[1].g, bright_led_data[1].b);

        // Wait 500ms before sending again (matching the original FreeRtos::delay_ms(500))
        Timer::after_millis(300).await;

        i += 1;
    }
}
