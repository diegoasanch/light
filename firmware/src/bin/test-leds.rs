#![no_std]
#![no_main]

use defmt::*;
use embassy_executor::Spawner;
use embassy_time::Timer;
use smart_leds::RGB8;
use {defmt_rtt as _, panic_probe as _};

use firmware::argb::Argb;
use firmware::create_argb;

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
    info!("Starting WS2812 ARGB LED control example");
    let p = embassy_rp::init(Default::default());

    const NUM_LEDS: usize = 2; // Try changing this to any number: 1, 3, 10, 100, 1000, etc.
    let mut led_data = [RGB8::default(); NUM_LEDS];
    
    // Initialize the ARGB LED driver
    // Using PIN_5 for the on-board LEDs
    // let led_pin = p.PIN_5;
    
    // Method 1: Using the macro (works with PIN_5)
    // let mut argb = create_argb!(NUM_LEDS, led_pin, p.PIO0, p.DMA_CH0);
    
    // Method 2: Using macro-generated constructors for different pins
    // let mut argb = Argb::<NUM_LEDS>::new(p.PIN_5, p.PIO0, p.DMA_CH0);
    // let mut argb = Argb::<NUM_LEDS>::new_pin6(p.PIN_6, p.PIO0, p.DMA_CH0);
    // let mut argb = Argb::<NUM_LEDS>::new_pin7(p.PIN_7, p.PIO0, p.DMA_CH0);
    // let mut argb = Argb::<NUM_LEDS>::new_pin8(p.PIN_8, p.PIO0, p.DMA_CH0);
    // let mut argb = Argb::<NUM_LEDS>::new_pin9(p.PIN_9, p.PIO0, p.DMA_CH0);
    // let mut argb = Argb::<NUM_LEDS>::new_pin10(p.PIN_10, p.PIO0, p.DMA_CH0);
    
    // Test that macro-generated constructor works (uncomment to test)
    let mut argb = Argb::<NUM_LEDS>::new_pin5(p.PIN_5, p.PIO0, p.DMA_CH0);

    // Set brightness to 5% (0.05)
    argb.set_brightness(0.05);

    info!("ARGB LED: Initialized with {} LEDs", argb.led_count());
    info!("LED pattern: Red, Green, Blue, Black, White");
    let mut i = 0;

    loop {
        // cycle through the colors
        led_data[0] = COLORS[i % NUM_COLORS];
        led_data[1] = COLORS[(i + 1) % NUM_COLORS];
        
        // Write the LED data (brightness is applied automatically)
        argb.write(&led_data).await;

        // Log the data being sent
        info!("ARGB LED: Sent LED data - LED0 R:{} G:{} B:{}, LED1 R:{} G:{} B:{}", 
              led_data[0].r, led_data[0].g, led_data[0].b,
              led_data[1].r, led_data[1].g, led_data[1].b);

        // Wait 300ms before sending again
        Timer::after_millis(300).await;

        i += 1;
    }
}
