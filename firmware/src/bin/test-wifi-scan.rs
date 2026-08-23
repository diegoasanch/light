//! WiFi bring-up test: detect the CYW43439 (Murata 1YN module) and scan for networks.
//!
//! This is the FIRST binary to run when validating WiFi on the board — it needs no
//! credentials and exercises exactly the layers that can fail, in order:
//! bus detection (FEEDBEAD) → firmware load → radio up → scan.
//!
//! Full driver logging (cyw43/cyw43_pio at trace) is baked into
//! .cargo/config.toml — the detection stage only logs at trace level, and at
//! plain `debug` a dead bus is totally silent. So simply:
//!
//!     cargo run --release --bin test-wifi-scan
//!
//! Positive controls that the trace filter is really active (defmt filtering is
//! compile-time; run `cargo clean -p cyw43 -p cyw43-pio` if these are missing):
//! cyw43_pio prints its PIO-program/frequency choice at startup, and right
//! after STAGE 2 cyw43 traces "WL_REG off/on" then "read REG_BUS_TEST_RO".
//!
//! How to read the output:
//! - Hangs after "STAGE 2" with no cyw43 logs (at trace: endless REG_BUS_TEST_RO reads)
//!   → gSPI bus problem: chip not answering (pins/power/strap). Trace read values:
//!   constant 0x00000000 = no response (unpowered or strapped into SDIO mode);
//!   constant 0xFFFFFFFF = floating DIO; unstable garbage = clocking/signal integrity.
//! - "chip ID: 43439" then hang at "waiting for HT clock..." or an F2-ready timeout
//!   panic → firmware blob upload problem (or marginal bus corrupting bulk transfers —
//!   try halving the SPI clock before blaming blobs; ours are sha256-verified).
//! - Panic "timeout while waiting for alp clock!" → chip detected but sick bus/clock.
//! - STAGE 3 + scan results → WiFi hardware fully vindicated.
//!
//! Board pin map (netlist-verified against kicad/light.kicad_sch rev 5):
//!   WL_ON  (module WL_REG_ON) = GPIO23,  WL_CS (SDIO_DATA_3) = GPIO25
//!   WL_D   (SDIO_CMD+DATA_2, the gSPI DIO) = GPIO24
//!   WL_CLK (SDIO_CLK, via 27R)             = GPIO11   <- NOT GPIO29 like the Pico 2W!

#![no_std]
#![no_main]

use core::str;

use cyw43::aligned_bytes;
use cyw43_pio::{PioSpi, RM2_CLOCK_DIVIDER};
use defmt::*;
use embassy_executor::Spawner;
use embassy_rp::gpio::{Level, Output};
use embassy_rp::peripherals::{DMA_CH0, PIO0};
use embassy_rp::pio::{InterruptHandler, Pio};
use embassy_rp::{bind_interrupts, dma};
use embassy_time::{Duration, Timer};
use static_cell::StaticCell;
use {defmt_rtt as _, panic_probe as _};

bind_interrupts!(struct Irqs {
    PIO0_IRQ_0 => InterruptHandler<PIO0>;
    DMA_IRQ_0 => dma::InterruptHandler<DMA_CH0>;
});

#[embassy_executor::task]
async fn cyw43_task(
    runner: cyw43::Runner<'static, cyw43::SpiBus<Output<'static>, PioSpi<'static, PIO0, 0>>>,
) -> ! {
    runner.run().await
}

#[embassy_executor::main]
async fn main(spawner: Spawner) {
    info!("STAGE 0: booted, initializing peripherals");
    let p = embassy_rp::init(Default::default());

    // Real blobs, sha256-verified — see cyw43-firmware/README.md for provenance.
    let fw = aligned_bytes!("../../cyw43-firmware/43439A0.bin");
    let clm = aligned_bytes!("../../cyw43-firmware/43439A0_clm.bin");
    let nvram = aligned_bytes!("../../cyw43-firmware/nvram_rp2040.bin");

    let pwr = Output::new(p.PIN_23, Level::Low); // WL_ON -> module WL_REG_ON
    let cs = Output::new(p.PIN_25, Level::High); // WL_CS
    let mut pio = Pio::new(p.PIO0, Irqs);
    let spi = PioSpi::new(
        &mut pio.common,
        pio.sm0,
        // 25 MHz gSPI: the conservative bring-up divider the embassy examples use
        // (https://github.com/embassy-rs/embassy/issues/3960). With the 27R series
        // resistor in WL_CLK, don't chase higher speeds until everything works.
        RM2_CLOCK_DIVIDER,
        pio.irq0,
        cs,
        p.PIN_24, // dio = WL_D
        p.PIN_11, // clk = WL_CLK (board-specific; Pico 2W uses GPIO29 here)
        dma::Channel::new(p.DMA_CH0, Irqs),
    );
    info!("STAGE 1: PioSpi ready (DIO=GPIO24, CLK=GPIO11, CS=GPIO25) — DIO+CLK now driven low");

    static STATE: StaticCell<cyw43::State> = StaticCell::new();
    let state = STATE.init(cyw43::State::new());

    info!("STAGE 2: cyw43::new — toggling REG_ON (GPIO23), then FEEDBEAD detection poll...");
    let (_net_device, mut control, runner) = cyw43::new(state, pwr, spi, fw, nvram).await;
    info!("STAGE 3: chip detected and firmware+NVRAM loaded!");

    spawner.spawn(unwrap!(cyw43_task(runner)));

    control.init(clm).await;
    control
        .set_power_management(cyw43::PowerManagementMode::PowerSave)
        .await;
    info!("STAGE 4: CLM loaded, radio configured — scanning");

    loop {
        let mut scanner = control.scan(Default::default()).await;
        let mut count = 0u32;
        while let Some(bss) = scanner.next().await {
            count += 1;
            let ssid_len = (bss.ssid_len as usize).min(bss.ssid.len());
            match str::from_utf8(&bss.ssid[..ssid_len]) {
                Ok(ssid_str) => {
                    info!("  found AP: {} (bssid {:x}, rssi {})", ssid_str, bss.bssid, bss.rssi)
                }
                Err(_) => info!("  found AP: <non-utf8 ssid> (bssid {:x}, rssi {})", bss.bssid, bss.rssi),
            }
        }
        drop(scanner);
        info!("scan pass complete: {} APs — rescanning in 5s", count);
        Timer::after(Duration::from_secs(5)).await;
    }
}
