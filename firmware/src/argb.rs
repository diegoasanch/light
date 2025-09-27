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
//! use firmware::create_argb;
//!
//! const NUM_LEDS: usize = 10;
//! let mut argb = create_argb!(NUM_LEDS, led_pin, p.PIO0, p.DMA_CH0);
//! argb.set_brightness(0.5);
//! argb.write(&led_colors).await;
//! ```

use embassy_rp::dma::Channel;
use embassy_rp::peripherals::{PIO0, PIO1};
use embassy_rp::pio::{Instance as PioInstance, InterruptHandler, Pio, PioPin};
use embassy_rp::pio_programs::ws2812::{PioWs2812, PioWs2812Program};
use embassy_rp::{Peri, bind_interrupts};
use smart_leds::{RGB8, brightness};

bind_interrupts!(struct Irqs {
    PIO0_IRQ_0 => InterruptHandler<PIO0>;
    PIO1_IRQ_0 => InterruptHandler<PIO1>;
});

/// Macro to generate constructors for different PIO instances
macro_rules! impl_pio_constructors {
    ($($pio:ty, $irq:ty;)*) => {
        $(
            impl<'d, const N: usize> Argb<'d, $pio, N> {
                pub fn new<Pin: PioPin, D: Channel>(
                    pin: Peri<'d, Pin>,
                    pio: Peri<'d, $pio>,
                    dma_ch: Peri<'d, D>,
                ) -> Self {
                    let Pio {
                        mut common, sm0, ..
                    } = Pio::new(pio, Irqs);
                    let program = PioWs2812Program::new(&mut common);
                    let ws2812 = PioWs2812::new(&mut common, sm0, dma_ch, pin, &program);

                    Self {
                        brightness: DEFAULT_BRIGHTNESS,
                        led_count: N,
                        ws2812,
                    }
                }
            }
        )*
    };
}

// Generate constructors for PIO0 and PIO1
impl_pio_constructors! {
    PIO0, embassy_rp::interrupt::PIO0_IRQ_0;
    PIO1, embassy_rp::interrupt::PIO1_IRQ_0;
}

/// ARGB (Addressable RGB) LED controller
///
/// ARGB stands for "Addressable" RGB, meaning each LED in the strip can be controlled
/// individually with its own color and brightness. This is different from regular RGB
/// strips where all LEDs show the same color.
///
/// This struct provides a high-level interface for controlling WS2812/WS2812B/NeoPixel
/// LED strips using the RP2040's PIO (Programmable I/O) peripheral for precise timing.
pub struct Argb<'d, P: PioInstance, const N: usize> {
    brightness: f32, // 0-1
    led_count: usize,
    ws2812: PioWs2812<'d, P, 0, N>,
}

const DEFAULT_BRIGHTNESS: f32 = 1.0;

impl<'d, P: PioInstance, const N: usize> Argb<'d, P, N> {
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
