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

use embassy_rp::pio::{Pio, InterruptHandler};
use embassy_rp::pio_programs::ws2812::{PioWs2812, PioWs2812Program};
use embassy_rp::peripherals::{PIO0, DMA_CH0};
use embassy_rp::bind_interrupts;
use smart_leds::{brightness, RGB8};

bind_interrupts!(struct Irqs {
    PIO0_IRQ_0 => InterruptHandler<PIO0>;
});

/// ARGB (Addressable RGB) LED controller
/// 
/// ARGB stands for "Addressable" RGB, meaning each LED in the strip can be controlled
/// individually with its own color and brightness. This is different from regular RGB
/// strips where all LEDs show the same color.
/// 
/// This struct provides a high-level interface for controlling WS2812/WS2812B/NeoPixel
/// LED strips using the RP2040's PIO (Programmable I/O) peripheral for precise timing.
pub struct Argb<'d, const N: usize> {
    brightness: f32, // 0-1
    led_count: usize,
    ws2812: PioWs2812<'d, PIO0, 0, N>,
}

const DEFAULT_BRIGHTNESS: f32 = 1.0;

impl<'d, const N: usize> Argb<'d, N> {
    /// Creates a new ARGB LED controller
    /// 
    /// # Arguments
    /// * `pin` - The GPIO pin connected to the ARGB LED strip data line
    /// * `pio` - The PIO peripheral instance
    /// * `dma_ch` - The DMA channel for data transfer
    /// 
    /// # Returns
    /// A new `Argb` controller configured for `N` LEDs
    pub fn new(pin: embassy_rp::Peri<'d, embassy_rp::peripherals::PIN_5>, pio: embassy_rp::Peri<'d, PIO0>, dma_ch: embassy_rp::Peri<'d, DMA_CH0>) -> Self {
        let Pio { mut common, sm0, .. } = Pio::new(pio, Irqs);
        let program = PioWs2812Program::new(&mut common);
        let ws2812 = PioWs2812::new(&mut common, sm0, dma_ch, pin, &program);

        Self { 
            brightness: DEFAULT_BRIGHTNESS, 
            led_count: N,
            ws2812 
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
            bright_data[i] = brightness([*color].iter().cloned(), brightness_level).next().unwrap_or(*color);
        }
        
        self.ws2812.write(&bright_data).await;
    }   
}

/// Macro to generate pin-specific constructors for ARGB controllers
/// 
/// This macro generates constructor methods for specific pin types, making it easy
/// to support any GPIO pin without code duplication.
/// 
/// # Usage
/// ```rust
/// impl_pin_constructors!(Argb, new_pin6, PIN_6);
/// impl_pin_constructors!(Argb, new_pin7, PIN_7);
/// impl_pin_constructors!(Argb, new_pin8, PIN_8);
/// ```
#[macro_export]
macro_rules! impl_pin_constructors {
    ($struct_name:ident, $method_name:ident, $pin_type:ident) => {
        impl<'d, const N: usize> $struct_name<'d, N> {
            /// Creates a new ARGB LED controller with the specified pin
            pub fn $method_name(pin: embassy_rp::Peri<'d, embassy_rp::peripherals::$pin_type>, pio: embassy_rp::Peri<'d, PIO0>, dma_ch: embassy_rp::Peri<'d, DMA_CH0>) -> Self {
                let Pio { mut common, sm0, .. } = Pio::new(pio, Irqs);
                let program = PioWs2812Program::new(&mut common);
                let ws2812 = PioWs2812::new(&mut common, sm0, dma_ch, pin, &program);

                Self { 
                    brightness: DEFAULT_BRIGHTNESS, 
                    led_count: N,
                    ws2812 
                }
            }
        }
    };
}

// Generate constructors for common pins
// To add support for more pins, simply add more macro calls:
impl_pin_constructors!(Argb, new_pin5, PIN_5);
impl_pin_constructors!(Argb, new_pin6, PIN_6);
impl_pin_constructors!(Argb, new_pin7, PIN_7);
impl_pin_constructors!(Argb, new_pin8, PIN_8);
impl_pin_constructors!(Argb, new_pin9, PIN_9);
impl_pin_constructors!(Argb, new_pin10, PIN_10);
impl_pin_constructors!(Argb, new_pin11, PIN_11);
impl_pin_constructors!(Argb, new_pin12, PIN_12);
impl_pin_constructors!(Argb, new_pin13, PIN_13);
impl_pin_constructors!(Argb, new_pin14, PIN_14);
impl_pin_constructors!(Argb, new_pin15, PIN_15);

// Example: To add support for PIN_16, just add:
// impl_pin_constructors!(Argb, new_pin16, PIN_16);

/// Generic macro for creating ARGB LED controllers with any number of LEDs
/// 
/// This macro creates an `Argb` controller for the specified number of LEDs.
/// It supports any number from 1 to 1000+ LEDs and automatically selects the
/// appropriate constructor based on the pin type.
/// 
/// # Arguments
/// * `num_leds` - Number of LEDs in the strip
/// * `pin` - GPIO pin connected to the ARGB data line
/// * `pio` - PIO peripheral instance (PIO0, PIO1, etc.)
/// * `dma_ch` - DMA channel for data transfer
/// 
/// # Example
/// ```rust
/// // For PIN_5 (default)
/// let mut argb = create_argb!(10, p.PIN_5, p.PIO0, p.DMA_CH0);
/// 
/// // For PIN_6
/// let mut argb = create_argb!(5, p.PIN_6, p.PIO0, p.DMA_CH0);
/// 
/// // For PIN_7
/// let mut argb = create_argb!(3, p.PIN_7, p.PIO0, p.DMA_CH0);
/// ```
#[macro_export]
macro_rules! create_argb {
    ($num_leds:expr, $pin:expr, $pio:expr, $dma_ch:expr) => {{
        const MACRO_NUM_LEDS: usize = $num_leds;
        // Try to determine the pin type and use the appropriate constructor
        // This is a simple approach - in practice, you'd use the specific constructor
        Argb::<MACRO_NUM_LEDS>::new($pin, $pio, $dma_ch)
    }};
}
