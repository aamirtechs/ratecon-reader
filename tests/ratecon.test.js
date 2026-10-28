const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { parseRateConfirmation, parseMoney, parseCityState } = require("../ratecon_reader.js");
const CLI = path.join(__dirname, "..", "ratecon_reader.js");

test("parses load number with hash variant", () => {
  const data = parseRateConfirmation("Load #: RC-88412\n");
  assert.equal(data.loadNumber, "RC-88412");
});

test("parses load number with Load No variant", () => {
  const data = parseRateConfirmation("Load No. 99177\n");
  assert.equal(data.loadNumber, "99177");
});

test("parses broker name and MC number", () => {
  const data = parseRateConfirmation("Broker: Lone Star Freight LLC\nMC #: 1234567\n");
  assert.equal(data.brokerName, "Lone Star Freight LLC");
  assert.equal(data.brokerMc, "1234567");
});

test("parses broker name variant and MC Number variant", () => {
  const data = parseRateConfirmation("Broker Name: Blue Ridge Logistics\nMC Number: 765432\n");
  assert.equal(data.brokerName, "Blue Ridge Logistics");
  assert.equal(data.brokerMc, "765432");
});

test("parses origin and destination with comma state", () => {
  const data = parseRateConfirmation("Origin: Dallas, TX\nDestination: Atlanta, GA\n");
  assert.deepEqual(data.origin, { city: "Dallas", state: "TX", raw: "Dallas, TX" });
  assert.deepEqual(data.destination, { city: "Atlanta", state: "GA", raw: "Atlanta, GA" });
});

test("collects intermediate stops while preserving origin and destination", () => {
  const data = parseRateConfirmation("Origin: Dallas, TX\nStop #1: Austin, TX\nStop #2: Houston, TX\nDestination: Atlanta, GA\n");
  assert.deepEqual(data.stops, [
    { city: "Austin", state: "TX", raw: "Austin, TX" },
    { city: "Houston", state: "TX", raw: "Houston, TX" },
  ]);
  assert.equal(data.origin.city, "Dallas");
  assert.equal(data.destination.city, "Atlanta");
});

test("parses pickup and delivery location variants without dates", () => {
  const data = parseRateConfirmation("Pickup Location: Houston TX 77001\nDelivery Location: Memphis, TN\n");
  assert.equal(data.origin.city, "Houston");
  assert.equal(data.origin.state, "TX");
  assert.equal(data.destination.city, "Memphis");
  assert.equal(data.pickupDate, null);
  assert.equal(data.deliveryDate, null);
});

test("parses pickup and delivery dates", () => {
  const data = parseRateConfirmation("Pick Up Date: 10/28/2026\nDelivery Date: 10/30/2026\n");
  assert.equal(data.pickupDate, "10/28/2026");
  assert.equal(data.deliveryDate, "10/30/2026");
});

test("parses ISO dates", () => {
  const data = parseRateConfirmation("Pick Up: 2026-11-02\nDelivery: 2026-11-04\n");
  assert.equal(data.pickupDate, "2026-11-02");
  assert.equal(data.deliveryDate, "2026-11-04");
});

test("parses money with dollar sign and commas", () => {
  assert.equal(parseMoney("$1,850.00"), 1850);
  assert.equal(parseMoney("1234.50"), 1234.5);
});

test("parses total rate, linehaul and fuel surcharge", () => {
  const data = parseRateConfirmation("Total Rate: $1,850.00\nLinehaul: $1,650.00\nFuel Surcharge: $200.00\n");
  assert.equal(data.totalRate, 1850);
  assert.equal(data.linehaul, 1650);
  assert.equal(data.fuelSurcharge, 200);
});

test("bare Rate line becomes the total rate", () => {
  const data = parseRateConfirmation("Rate: 1450.00\n");
  assert.equal(data.totalRate, 1450);
});

test("parses miles, weight and commodity", () => {
  const data = parseRateConfirmation("Miles: 820\nWeight: 42000 lbs\nCommodity: Paper rolls\n");
  assert.equal(data.miles, 820);
  assert.equal(data.weight, 42000);
  assert.equal(data.commodity, "Paper rolls");
});

test("collects detention and layover notes", () => {
  const data = parseRateConfirmation("Detention: $75 per hour after 2 hours.\nLayover note: Layover pays $250 per day.\n");
  assert.equal(data.notes.length, 2);
  assert.match(data.notes[0], /Detention/);
});

test("missing fields stay null", () => {
  const data = parseRateConfirmation("Load #: X1\n");
  assert.equal(data.origin, null);
  assert.equal(data.totalRate, null);
});

test("parses city state without a comma", () => {
  assert.deepEqual(parseCityState("Houston TX"), { city: "Houston", state: "TX", raw: "Houston TX" });
});

test("strips a ZIP code from a city state value", () => {
  assert.equal(parseCityState("Houston TX 77001").city, "Houston");
  assert.equal(parseCityState("Houston TX 77001").state, "TX");
});

test("parses the first example file end to end", () => {
  const text = fs.readFileSync(path.join(__dirname, "..", "examples", "ratecon1.txt"), "utf8");
  const data = parseRateConfirmation(text);
  assert.equal(data.loadNumber, "RC-88412");
  assert.equal(data.origin.city, "Dallas");
  assert.equal(data.destination.city, "Atlanta");
  assert.equal(data.totalRate, 1850);
  assert.equal(data.miles, 820);
  assert.equal(data.notes.length, 1);
});

test("parses the second example file end to end", () => {
  const text = fs.readFileSync(path.join(__dirname, "..", "examples", "ratecon2.txt"), "utf8");
  const data = parseRateConfirmation(text);
  assert.equal(data.loadNumber, "99177");
  assert.equal(data.origin.city, "Houston");
  assert.equal(data.destination.city, "Memphis");
  assert.equal(data.totalRate, 1450);
  assert.equal(data.pickupDate, "2026-11-02");
  assert.equal(data.notes.length, 1);
});

test("CLI prints JSON by default", () => {
  const out = execFileSync(process.execPath, [CLI, path.join(__dirname, "..", "examples", "ratecon1.txt")], { encoding: "utf8" });
  const data = JSON.parse(out);
  assert.equal(data.loadNumber, "RC-88412");
  assert.equal(data.totalRate, 1850);
});

test("CLI reads stdin when no file is given", () => {
  const out = execFileSync(process.execPath, [CLI], { input: "Load #: A1\nOrigin: Dallas, TX\nDestination: Atlanta, GA\nTotal: $900.00\n", encoding: "utf8" });
  assert.equal(JSON.parse(out).loadNumber, "A1");
});

test("CLI summary is human readable", () => {
  const out = execFileSync(process.execPath, [CLI, "--summary", path.join(__dirname, "..", "examples", "ratecon1.txt")], { encoding: "utf8" });
  assert.match(out, /Dallas, TX -> Atlanta, GA/);
  assert.match(out, /\$1850\.00/);
});

test("CLI check exits 1 when required fields are missing", () => {
  const result = spawnSync(process.execPath, [CLI, "--check"], { input: "Load #: A1\n", encoding: "utf8" });
  assert.equal(result.status, 1);
});

test("CLI check exits 0 when required fields are present", () => {
  const result = spawnSync(process.execPath, [CLI, "--check"], {
    input: "Load #: A1\nOrigin: Dallas, TX\nDestination: Atlanta, GA\nTotal: $900.00\n",
    encoding: "utf8",
  });
  assert.equal(result.status, 0);
});
