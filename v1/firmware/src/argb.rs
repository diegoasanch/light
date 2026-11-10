//! ARGB (Addressable RGB) LED Control Module
//!
//! This module provides a high-level interface for controlling ARGB LED strips.
//! ARGB stands for "Addressable" RGB, meaning each LED in the strip can be controlled
//! individually with its own color and brightness. This is different from regular RGB
//! strips where all LEDs show the same color.
//!
//! The module supports popular ARGB LED types including:
//! - WS2812/WS2812B (NeoPixel)
//! - WS2813
//! - SK6812
//! - And other compatible addressable RGB LEDs
//!
//! # Example
//! ```rust
//! use embassy_rp::peripherals::{DMA_CH1, PIO1};
//! use embassy_rp::pio::InterruptHandler;
//! use embassy_rp::{bind_interrupts, dma};
//! use firmware::argb::Argb;
//!
//! bind_interrupts!(struct Irqs {
//!     PIO1_IRQ_0 => InterruptHandler<PIO1>;
//!     DMA_IRQ_0 => dma::InterruptHandler<DMA_CH1>;
//! });
//!
//! const NUM_LEDS: usize = 10;
//! let mut argb = Argb::<PIO1, NUM_LEDS>::new(led_pin, p.PIO1, p.DMA_CH1, Irqs);
//! argb.set_brightness(0.5);
//! argb.write(&led_colors).await;
//! ```

use embassy_rp::Peri;
use embassy_rp::dma::{self, ChannelInstance};
use embassy_rp::interrupt::typelevel::Binding;
use embassy_rp::pio::{Instance as PioInstance, InterruptHandler, Pio, PioPin};
use embassy_rp::pio_programs::ws2812::{Grb, PioWs2812, PioWs2812Program};
use smart_leds::{RGB8, brightness};

/// ARGB (Addressable RGB) LED controller
///
/// ARGB stands for "Addressable" RGB, meaning each LED in the strip can be controlled
/// individually with its own color and brightness. This is different from regular RGB
/// strips where all LEDs show the same color.
///
/// This struct provides a high-level interface for controlling WS2812/WS2812B/NeoPixel
/// LED strips using the RP2350's PIO (Programmable I/O) peripheral for precise timing.
pub struct Argb<'d, P: PioInstance, const N: usize> {
    brightness: f32, // 0-1
    led_count: usize,
    ws2812: PioWs2812<'d, P, 0, N, Grb>,
}

const DEFAULT_BRIGHTNESS: f32 = 1.0;

impl<'d, P: PioInstance, const N: usize> Argb<'d, P, N> {
    /// Creates a new ARGB controller on the given PIO instance and DMA channel.
    ///
    /// `irqs` must be a `bind_interrupts!` struct binding both the PIO's IRQ0
    /// (`pio::InterruptHandler<P>`) and `DMA_IRQ_0` (`dma::InterruptHandler<D>`)
    /// for the channel used. Interrupt bindings live in the binary, not this
    /// library, so binaries that also use PIO0 for other drivers (e.g. the
    /// cyw43 WiFi SPI) can put this driver on PIO1 without handler collisions.
    pub fn new<D: ChannelInstance>(
        pin: Peri<'d, impl PioPin>,
        pio: Peri<'d, P>,
        dma_ch: Peri<'d, D>,
        irqs: impl Binding<P::Interrupt, InterruptHandler<P>>
        + Binding<D::Interrupt, dma::InterruptHandler<D>>
        + Copy
        + 'd,
    ) -> Self {
        let Pio {
            mut common, sm0, ..
        } = Pio::new(pio, irqs);
        let program = PioWs2812Program::new(&mut common);
        let ws2812 = PioWs2812::new(&mut common, sm0, dma_ch, irqs, pin, &program);

        Self {
            brightness: DEFAULT_BRIGHTNESS,
            led_count: N,
            ws2812,
        }
    }

    /// Sets the global brightness for all LEDs
    ///
    /// # Arguments
    /// * `brightness` - Brightness level from 0.0 (off) to 1.0 (full brightness)
    pub fn set_brightness(&mut self, brightness: f32) {
        self.brightness = brightness.clamp(0.0, 1.0);
    }

    /// Returns the number of LEDs in this ARGB strip
    pub fn led_count(&self) -> usize {
        self.led_count
    }

    /// Writes color data to the ARGB LED strip
    ///
    /// # Arguments
    /// * `data` - Slice of RGB8 colors, one for each LED
    ///
    /// # Note
    /// The brightness setting is applied to all colors before sending to the LEDs.
    /// If fewer colors are provided than LEDs, the remaining LEDs will be set to black.
    pub async fn write(&mut self, data: &[RGB8]) {
        // Apply brightness to the LED data
        let brightness_level = (255f32 * self.brightness) as u8;

        // Convert to array format expected by PioWs2812 (N LEDs)
        let mut bright_data = [RGB8::default(); N];

        // Process up to N LEDs from the input data
        for (i, color) in data.iter().take(N).enumerate() {
            bright_data[i] = brightness([*color].iter().cloned(), brightness_level)
                .next()
                .unwrap_or(*color);
        }

        self.ws2812.write(&bright_data).await;
    }
}
