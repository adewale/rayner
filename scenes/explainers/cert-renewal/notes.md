# Certificate renewal notes

The policy timeline and profile lifetimes are the schedules linked by the scene, including the CA/Browser Forum limits and Let’s Encrypt’s announced changes. They are context for the arithmetic, not a live policy lookup.

The model compares Certbot 3.3’s fixed interval, the 4.1 default introduced by its renewal change, and behavior read from 5.8. An explicit stored thirty-day interval can take precedence over the newer default. The rate-limit exemption requires both a replacement identifier and timing inside the predecessor’s ARI window; the modeled 5.8 orders lack that identifier.

Runs occur every twelve hours. Certificate timestamps, backdating and limit recovery come from the pinned Certbot and Boulder sources. The ARI example uses a modeled window around the due fraction and repeated random choices; it is not a captured CA response. Counts are consequences of these timings, rather than forecasts for a deployed installation.
