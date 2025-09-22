 #![no_std]
#![no_main]

use defmt::*;
use embassy_executor::Spawner;
use embassy_time::Timer;
use embassy_rp::gpio::{Output, Level};
use {defmt_rtt as _, panic_probe as _};

// Configurable toggle interval in milliseconds
const TOGGLE_INTERVAL_MS: u64 = 3000; // 3 seconds

#[embassy_executor::main]
async fn main(_spawner: Spawner) {
    info!("Starting Power Switch test - GPIO Pin 17");
    
    // Initialize the RP2350
    let p = embassy_rp::init(Default::default());
    
    // Configure GPIO pin 17 as output
    let mut power_switch = Output::new(p.PIN_17, Level::Low);
    
    info!("Power Switch: Initialized GPIO pin 17 as output");
    info!("Power Switch: Toggle interval set to {} ms", TOGGLE_INTERVAL_MS);
    
    let mut current_state = false;
    
    loop {
        // Toggle the power switch state
        current_state = !current_state;
        
        // Set the GPIO pin level based on current state
        if current_state {
            power_switch.set_high();
            info!("Power Switch: State changed to HIGH (ON)");
        } else {
            power_switch.set_low();
            info!("Power Switch: State changed to LOW (OFF)");
        }
        
        // Wait for the configured interval before next toggle
        Timer::after_millis(TOGGLE_INTERVAL_MS).await;
    }
}
