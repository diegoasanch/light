#![no_std]
#![no_main]

use defmt::*;
use embassy_executor::Spawner;
use embassy_time::Timer;
use {defmt_rtt as _, panic_probe as _};

#[embassy_executor::main]
async fn main(_spawner: Spawner) {
    info!("Starting Hello World example");

    // Initialize the RP2350
    let _p = embassy_rp::init(Default::default());

    let mut i = 0;

    loop {
        info!("Hello, world! {}", i);

        // Wait 500ms before sending again (matching the original FreeRtos::delay_ms(500))
        Timer::after_millis(300).await;

        i += 1;
    }
}
