//! WiFi end-to-end test: join a network, get DHCP, make an HTTP request.
//!
//! Run `test-wifi-scan` FIRST to validate the chip/bus — this binary assumes the
//! radio already works and adds credentials + the network stack on top.
//!
//! The HTTP target is Apple's captive-portal probe (`captive.apple.com`): it is
//! plain HTTP by design (iOS hotspot detection depends on it), never redirects,
//! and returns a tiny "Success" body — ideal for this TLS-less build. Most
//! public APIs 301 to HTTPS, and worldtimeapi.org is dead (SYN retransmits
//! observed on the bench, 2026-08-23).
//!
//! Credentials are taken from compile-time env vars so they never live in the repo:
//!
//!     WIFI_NETWORK="MySSID" WIFI_PASSWORD="secret" \
//!     DEFMT_LOG=debug,cyw43=trace cargo run --release --bin test-wifi
//!
//! Board pin map (netlist-verified): WL_ON=GPIO23, WL_CS=GPIO25,
//! WL_D(dio)=GPIO24, WL_CLK=GPIO11 (via 27R; NOT GPIO29 like the Pico 2W).

#![no_std]
#![no_main]
#![allow(async_fn_in_trait)]

use core::str::from_utf8;

use cyw43::{JoinOptions, aligned_bytes};
use cyw43_pio::{PioSpi, RM2_CLOCK_DIVIDER};
use defmt::*;
use embassy_executor::Spawner;
use embassy_net::dns::DnsSocket;
use embassy_net::tcp::client::{TcpClient, TcpClientState};
use embassy_net::{Config, StackResources};
use embassy_rp::clocks::RoscRng;
use embassy_rp::gpio::{Level, Output};
use embassy_rp::peripherals::{DMA_CH0, PIO0};
use embassy_rp::pio::{InterruptHandler, Pio};
use embassy_rp::{bind_interrupts, dma};
use embassy_time::{Duration, Timer};
use reqwless::client::HttpClient;
use reqwless::request::Method;
use static_cell::StaticCell;
use {defmt_rtt as _, panic_probe as _};

bind_interrupts!(struct Irqs {
    PIO0_IRQ_0 => InterruptHandler<PIO0>;
    DMA_IRQ_0 => dma::InterruptHandler<DMA_CH0>;
});

// Set at build time; placeholders keep the binary compilable without secrets.
const WIFI_NETWORK: &str = match option_env!("WIFI_NETWORK") {
    Some(v) => v,
    None => "SET_WIFI_NETWORK_ENV_VAR",
};
const WIFI_PASSWORD: &str = match option_env!("WIFI_PASSWORD") {
    Some(v) => v,
    None => "SET_WIFI_PASSWORD_ENV_VAR",
};

#[embassy_executor::task]
async fn cyw43_task(
    runner: cyw43::Runner<'static, cyw43::SpiBus<Output<'static>, PioSpi<'static, PIO0, 0>>>,
) -> ! {
    runner.run().await
}

#[embassy_executor::task]
async fn net_task(mut runner: embassy_net::Runner<'static, cyw43::NetDriver<'static>>) -> ! {
    runner.run().await
}

#[embassy_executor::main]
async fn main(spawner: Spawner) {
    info!("Starting WiFi web-request example");
    let p = embassy_rp::init(Default::default());
    let mut rng = RoscRng;

    let fw = aligned_bytes!("../../cyw43-firmware/43439A0.bin");
    let clm = aligned_bytes!("../../cyw43-firmware/43439A0_clm.bin");
    let nvram = aligned_bytes!("../../cyw43-firmware/nvram_rp2040.bin");

    let pwr = Output::new(p.PIN_23, Level::Low); // WL_ON -> module WL_REG_ON
    let cs = Output::new(p.PIN_25, Level::High); // WL_CS
    let mut pio = Pio::new(p.PIO0, Irqs);
    let spi = PioSpi::new(
        &mut pio.common,
        pio.sm0,
        // Conservative 25 MHz gSPI clock for reliable operation; see
        // https://github.com/embassy-rs/embassy/issues/3960
        RM2_CLOCK_DIVIDER,
        pio.irq0,
        cs,
        p.PIN_24, // dio = WL_D
        p.PIN_11, // clk = WL_CLK (board-specific; Pico 2W uses GPIO29 here)
        dma::Channel::new(p.DMA_CH0, Irqs),
    );

    static STATE: StaticCell<cyw43::State> = StaticCell::new();
    let state = STATE.init(cyw43::State::new());
    let (net_device, mut control, runner) = cyw43::new(state, pwr, spi, fw, nvram).await;
    spawner.spawn(unwrap!(cyw43_task(runner)));

    control.init(clm).await;
    control
        .set_power_management(cyw43::PowerManagementMode::PowerSave)
        .await;

    let config = Config::dhcpv4(Default::default());
    let seed = rng.next_u64();

    static RESOURCES: StaticCell<StackResources<5>> = StaticCell::new();
    let (stack, runner) = embassy_net::new(
        net_device,
        config,
        RESOURCES.init(StackResources::new()),
        seed,
    );
    spawner.spawn(unwrap!(net_task(runner)));

    while let Err(err) = control
        .join(WIFI_NETWORK, JoinOptions::new(WIFI_PASSWORD.as_bytes()))
        .await
    {
        info!("join failed: {:?}", err);
        Timer::after(Duration::from_secs(1)).await;
    }
    info!("joined {}", WIFI_NETWORK);

    info!("waiting for link...");
    stack.wait_link_up().await;

    info!("waiting for DHCP...");
    stack.wait_config_up().await;
    if let Some(cfg) = stack.config_v4() {
        info!("got IP: {}", cfg.address);
    }

    info!("Stack is up!");

    loop {
        let mut rx_buffer = [0; 8192];

        let client_state = TcpClientState::<1, 4096, 4096>::new();
        let tcp_client = TcpClient::new(stack, &client_state);
        let dns_client = DnsSocket::new(stack);

        let mut http_client = HttpClient::new(&tcp_client, &dns_client);
        let url = "http://captive.apple.com/hotspot-detect.html";

        info!("connecting to {}", &url);

        let mut request = match http_client.request(Method::GET, url).await {
            Ok(req) => req,
            Err(e) => {
                error!("Failed to make HTTP request: {:?}", e);
                Timer::after(Duration::from_secs(5)).await;
                continue;
            }
        };

        let response = match request.send(&mut rx_buffer).await {
            Ok(resp) => resp,
            Err(e) => {
                error!("Failed to send HTTP request: {:?}", e);
                Timer::after(Duration::from_secs(5)).await;
                continue;
            }
        };

        let status = response.status.0;
        info!("Response status: {}", status);

        let body = match response.body().read_to_end().await {
            Ok(b) => match from_utf8(b) {
                Ok(s) => s,
                Err(_) => {
                    error!("Response body is not UTF-8");
                    Timer::after(Duration::from_secs(5)).await;
                    continue;
                }
            },
            Err(_) => {
                error!("Failed to read response body");
                Timer::after(Duration::from_secs(5)).await;
                continue;
            }
        };

        if status == 200 && body.contains("Success") {
            info!("=== INTERNET CONNECTIVITY CONFIRMED === body: {}", body);
        } else {
            let preview = if body.len() > 200 { &body[..200] } else { body };
            warn!("unexpected response; body preview: {}", preview);
        }

        Timer::after(Duration::from_secs(15)).await;
    }
}
