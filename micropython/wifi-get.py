import rp2, network, time

# NOTE: stock Pico 2W MicroPython builds can NEVER work on this board — they
# hardcode WL_CLK=GPIO29 at compile time; this board uses GPIO11. Kept only as
# a historical artifact. Credentials redacted 2026-08-23 (see firmware/WIFI.md).
SSID = "YOUR_SSID_HERE"
PASSWORD = "YOUR_PASSWORD_HERE"

rp2.country('AR')  # set to your country code, e.g., 'AR', 'US', 'CA', 'MX', etc.

wlan = network.WLAN(network.STA_IF)
wlan.active(True)
wlan.config(pm=0xa11140)  # optional: reduce power-save flakiness
print("Scanning…")
print(wlan.scan())        # should list APs; if this raises EPERM, it’s still a firmware/region issue

print("Connecting…")
wlan.connect(SSID, PASSWORD)

t0 = time.ticks_ms()
while not wlan.isconnected():
    if time.ticks_diff(time.ticks_ms(), t0) > 15000:
        raise RuntimeError("Wi-Fi connect timeout")
    time.sleep_ms(200)

print("Connected:", wlan.ifconfig())