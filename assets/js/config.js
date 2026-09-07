/*
 * ============================================================================
 *  A Plus Salon — Central Configuration
 * ============================================================================
 *  This is the ONLY file the salon owner needs to edit to customize the site.
 *  It exposes a global `window.SALON_CONFIG` object (plain script, no build
 *  step / no import required). It is loaded BEFORE main.js.
 *
 *  >>> OWNER: EDIT THE VALUES MARKED "EDIT ME" BELOW <<<
 * ----------------------------------------------------------------------------
 */
(function () {
  "use strict";

  window.SALON_CONFIG = {
    /* ---- Basic business identity (EDIT ME) ---- */
    salonName: "A Plus Salon",
    tagline: "Look Your Best, Feel Your Best",

    /*
     * EDIT ME — WhatsApp number in FULL international format,
     * digits only: NO '+', NO spaces, NO dashes.
     * Format: <countrycode><number>. Example (India): 919999999999
     * This number receives every booking/lead as a WhatsApp message.
     */
    ownerWhatsApp: "919999999999",

    /* EDIT ME — number shown/dialed on the site (human friendly is fine) */
    displayPhone: "+91 99999 99999",

    /* EDIT ME — street address + city */
    address: "123 Main Street, Near City Center",
    city: "Your City",

    /* EDIT ME — shown in the footer and used in JSON-LD SEO schema */
    businessHours: "Mon–Sun: 10:00 AM – 8:00 PM",

    /* EDIT ME — social profile links (leave a value empty "" to hide it) */
    socialLinks: {
      instagram: "https://instagram.com/",
      facebook: "https://facebook.com/",
      maps: "https://maps.google.com/"
    },

    /*
     * EDIT ME — Services. Add/remove/reorder freely.
     * Each service: { id, name, priceFrom, durationMins, description }
     *   - id           : unique short slug (used internally)
     *   - name         : displayed service name
     *   - priceFrom    : starting price (number, shown as "From ₹<n>")
     *   - durationMins : approximate duration in minutes
     *   - description  : short one-line description
     */
    currencySymbol: "₹",
    services: [
      {
        id: "haircut-styling",
        name: "Haircut & Styling",
        priceFrom: 299,
        durationMins: 45,
        description: "Precision cut and blow-dry styling tailored to your face shape."
      },
      {
        id: "hair-color",
        name: "Hair Color",
        priceFrom: 999,
        durationMins: 90,
        description: "Global color, highlights and root touch-ups with premium products."
      },
      {
        id: "facial",
        name: "Facial & Clean-up",
        priceFrom: 599,
        durationMins: 60,
        description: "Deep-cleansing facials for glowing, refreshed and healthy skin."
      },
      {
        id: "mani-pedi",
        name: "Manicure & Pedicure",
        priceFrom: 499,
        durationMins: 60,
        description: "Relaxing nail care, cuticle treatment and polish for hands and feet."
      },
      {
        id: "bridal-makeup",
        name: "Bridal Makeup",
        priceFrom: 4999,
        durationMins: 120,
        description: "Complete bridal look with HD makeup, hairstyling and draping."
      },
      {
        id: "hair-spa",
        name: "Hair Spa & Treatment",
        priceFrom: 799,
        durationMins: 75,
        description: "Nourishing spa therapy to repair, strengthen and add shine."
      },
      {
        id: "beard-grooming",
        name: "Beard Grooming",
        priceFrom: 199,
        durationMins: 30,
        description: "Sharp beard trim, shaping and grooming for a clean finish."
      },
      {
        id: "threading-waxing",
        name: "Threading & Waxing",
        priceFrom: 149,
        durationMins: 30,
        description: "Smooth, precise threading and waxing for a flawless look."
      }
    ]
  };
})();
