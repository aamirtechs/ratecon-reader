# ratecon-reader

A pure JavaScript, zero dependency Node CLI that parses a broker rate confirmation text dump into structured JSON. Paste or save the text you get from a PDF export (the style of `pdftotext` output) and get load, route, date, and rate fields back without retyping them.

There are no network calls. Everything runs locally.

## Fields parsed

Load number, broker name, broker MC number, origin city and state, destination city and state, pickup date, delivery date, total rate, linehaul, fuel surcharge, miles, weight, commodity, and any detention or layover note lines.

## Label variants handled

Load #, Load No, Broker, Broker Name, MC #, MC Number, Origin, Pickup Location, Destination, Delivery Location, Pick Up, Pickup Date, Delivery, Delivery Date, Total Rate, Total, Rate, Linehaul, Fuel Surcharge, Miles, Weight, Commodity, Freight, and money formats such as `$1,234.50` and `1234.50`.

## Usage

```sh
node ratecon_reader.js <file>
node ratecon_reader.js --summary <file>
node ratecon_reader.js --check <file>
cat ratecon.txt | node ratecon_reader.js
```

With no file argument, the tool reads stdin. `--json` is the default output. `--summary` prints a one page human readable summary. `--check` exits 1 when any standard required field is missing (load number, origin, destination, total rate) and 0 otherwise. Add `--strict` alongside `--check` to also require linehaul, fuel surcharge, and miles. Without `--strict`, those three fields remain optional for completeness checks.

## Real output

Parsing `examples/ratecon1.txt`:

```text
$ node ratecon_reader.js examples/ratecon1.txt
{
  "loadNumber": "RC-88412",
  "brokerName": "Lone Star Freight LLC",
  "brokerMc": "1234567",
  "origin": {
    "city": "Dallas",
    "state": "TX",
    "raw": "Dallas, TX"
  },
  "destination": {
    "city": "Atlanta",
    "state": "GA",
    "raw": "Atlanta, GA"
  },
  "pickupDate": "10/28/2026",
  "deliveryDate": "10/30/2026",
  "totalRate": 1850,
  "linehaul": 1650,
  "fuelSurcharge": 200,
  "miles": 820,
  "weight": 42000,
  "commodity": "Paper rolls",
  "notes": [
    "Detention: $75 per hour after 2 hours free time."
  ]
}
```

Summary for the same file:

```text
$ node ratecon_reader.js --summary examples/ratecon1.txt
Load: RC-88412
Broker: Lone Star Freight LLC (MC 1234567)
Route: Dallas, TX -> Atlanta, GA
Pickup: 10/28/2026
Delivery: 10/30/2026
Rate: $1850.00
Linehaul: $1650.00
Fuel surcharge: $200.00
Miles: 820
Weight: 42000
Commodity: Paper rolls
Notes:
  - Detention: $75 per hour after 2 hours free time.
```

Parsing `examples/ratecon2.txt`, which uses different labels (Load No, Pickup Location, Rate without a dollar sign), gives:

```text
$ node ratecon_reader.js examples/ratecon2.txt
{
  "loadNumber": "99177",
  "brokerName": "Blue Ridge Logistics",
  "brokerMc": "765432",
  "origin": {
    "city": "Houston",
    "state": "TX",
    "raw": "Houston TX"
  },
  "destination": {
    "city": "Memphis",
    "state": "TN",
    "raw": "Memphis, TN"
  },
  "pickupDate": "2026-11-02",
  "deliveryDate": "2026-11-04",
  "totalRate": 1450,
  "linehaul": null,
  "fuelSurcharge": null,
  "miles": 640,
  "weight": 38000,
  "commodity": "Steel coils",
  "notes": [
    "Layover note: Layover pays $250 per day if carrier is held overnight."
  ]
}
```

Fields the dump does not contain stay `null` rather than being guessed. `--check` exits 0 for both example files, because both contain all required fields.

## Tests

```sh
npm test
```

Result: 23 passed.

## License

MIT. See LICENSE.
