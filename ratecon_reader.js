#!/usr/bin/env node
// ratecon-reader: parse a broker rate confirmation text dump into JSON.
// Zero dependencies, no network access. Reads a file or stdin.

const fs = require("fs");

function parseMoney(raw) {
  if (raw == null) return null;
  const match = String(raw).match(/\$?\s*([\d,]+(?:\.\d{1,2})?)/);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

function parseNumber(raw) {
  if (raw == null) return null;
  const match = String(raw).match(/([\d,]+(?:\.\d+)?)/);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

function parseCityState(raw) {
  if (raw == null) return null;
  let value = String(raw).trim().replace(/\s+\d{5}(?:-\d{4})?\s*$/, "").trim();
  if (!value) return null;
  const comma = value.split(",");
  if (comma.length >= 2) {
    return { city: comma[0].trim(), state: comma[1].trim().split(/\s+/)[0].toUpperCase(), raw: value };
  }
  const parts = value.split(/\s+/);
  const last = parts[parts.length - 1];
  if (parts.length >= 2 && /^[A-Za-z]{2}$/.test(last)) {
    return { city: parts.slice(0, -1).join(" "), state: last.toUpperCase(), raw: value };
  }
  return { city: value, state: null, raw: value };
}

function extractDate(raw) {
  if (raw == null) return null;
  const value = String(raw).trim();
  const match = value.match(/\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|[A-Za-z]+ \d{1,2},? \d{4}/);
  return match ? match[0] : value;
}

function valueAfter(line, labelPattern) {
  const match = line.match(labelPattern);
  if (!match) return null;
  let rest = line.slice(match[0].length).trim();
  rest = rest.replace(/^[ :#\-.]+/, "").trim();
  return rest || null;
}

// Ordered label matchers. Each returns the captured value after the label.
const LABELS = [
  { key: "loadNumber", patterns: [/load\s*(?:#|no\.?|number)/i] },
  { key: "brokerName", patterns: [/broker(?:\s+name)?\b/i] },
  { key: "brokerMc", patterns: [/broker\s+mc/i, /mc\s*(?:#|no\.?|number)?/i] },
  { key: "origin", patterns: [/origin\b/i, /pickup\s+location\b/i, /^from\b/i] },
  { key: "destination", patterns: [/destination\b/i, /delivery\s+location\b/i, /^to\b/i] },
  { key: "pickupDate", patterns: [/pick\s*up\s*(?:date)?\b/i, /pickup\s+date\b/i] },
  { key: "deliveryDate", patterns: [/delivery\s*(?:date)?\b/i, /drop\s*(?:off)?\s*date\b/i] },
  { key: "totalRate", patterns: [/total\s*(?:rate|amount|pay)?\b/i, /\btotal\b/i] },
  { key: "linehaul", patterns: [/line\s*haul\b/i] },
  { key: "fuelSurcharge", patterns: [/fuel\s*surcharge\b/i, /\bFSC\b/i] },
  { key: "miles", patterns: [/miles?\b/i, /distance\b/i] },
  { key: "weight", patterns: [/weight\b/i] },
  { key: "commodity", patterns: [/commodity\b/i, /\bproduct\b/i, /\bcargo\b/i, /\bfreight\b/i] },
];

function parseRateConfirmation(text) {
  const result = {
    loadNumber: null,
    brokerName: null,
    brokerMc: null,
    origin: null,
    destination: null,
    pickupDate: null,
    deliveryDate: null,
    totalRate: null,
    linehaul: null,
    fuelSurcharge: null,
    miles: null,
    weight: null,
    commodity: null,
    notes: [],
  };
  const lines = String(text).split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/detention|layover/i.test(line)) {
      result.notes.push(line);
    }
    for (const label of LABELS) {
      // A location line is not a date line, even though it starts with
      // "Pickup" or "Delivery".
      if ((label.key === "pickupDate" || label.key === "deliveryDate") && /location/i.test(line)) continue;
      // A broker name line always carries a colon. Without that rule a
      // header such as "BROKER RATE CONFIRMATION" would be read as a name.
      if (label.key === "brokerName" && !/:/.test(line)) continue;
      for (const pattern of label.patterns) {
        // Only treat a line as a labelled line when the label appears at
        // the start, except for broker MC which may follow a broker name.
        const anchored = new RegExp("^(?:[^:]{0,40}?)" + pattern.source, pattern.flags);
        const match = line.match(anchored);
        if (!match) continue;
        const value = valueAfter(line, pattern);
        if (value == null || value === "") continue;
        if (label.key === "brokerMc") {
          const mc = value.match(/\d+/);
          if (mc && result.brokerMc == null) result.brokerMc = mc[0];
          continue;
        }
        if (label.key === "origin" || label.key === "destination") {
          if (result[label.key] == null) result[label.key] = parseCityState(value);
          continue;
        }
        if (label.key === "pickupDate" || label.key === "deliveryDate") {
          if (result[label.key] == null) result[label.key] = extractDate(value);
          continue;
        }
        if (label.key === "totalRate" || label.key === "linehaul" || label.key === "fuelSurcharge") {
          if (result[label.key] == null) result[label.key] = parseMoney(value);
          continue;
        }
        if (label.key === "miles" || label.key === "weight") {
          if (result[label.key] == null) result[label.key] = parseNumber(value);
          continue;
        }
        if (result[label.key] == null) result[label.key] = value;
        break;
      }
    }
  }
  // A bare "Rate:" line is the total when no total line was present.
  if (result.totalRate == null) {
    for (const rawLine of lines) {
      const line = rawLine.trim();
      const match = line.match(/^rate\s*[:\-]\s*(.+)$/i);
      if (match) {
        result.totalRate = parseMoney(match[1]);
        break;
      }
    }
  }
  return result;
}

function formatSummary(data) {
  const origin = data.origin ? data.origin.city + ", " + data.origin.state : "unknown";
  const destination = data.destination ? data.destination.city + ", " + data.destination.state : "unknown";
  const rows = [
    "Load: " + (data.loadNumber || "unknown"),
    "Broker: " + (data.brokerName || "unknown") + (data.brokerMc ? " (MC " + data.brokerMc + ")" : ""),
    "Route: " + origin + " -> " + destination,
    "Pickup: " + (data.pickupDate || "unknown"),
    "Delivery: " + (data.deliveryDate || "unknown"),
    "Rate: " + (data.totalRate != null ? "$" + data.totalRate.toFixed(2) : "unknown"),
  ];
  if (data.linehaul != null) rows.push("Linehaul: $" + data.linehaul.toFixed(2));
  if (data.fuelSurcharge != null) rows.push("Fuel surcharge: $" + data.fuelSurcharge.toFixed(2));
  if (data.miles != null) rows.push("Miles: " + data.miles);
  if (data.weight != null) rows.push("Weight: " + data.weight);
  if (data.commodity) rows.push("Commodity: " + data.commodity);
  if (data.notes.length) rows.push("Notes:");
  for (const note of data.notes) rows.push("  - " + note);
  return rows.join("\n");
}

function readInput(path) {
  if (!path || path === "-") return fs.readFileSync(0, "utf8");
  return fs.readFileSync(path, "utf8");
}

function main(argv) {
  const args = argv.slice(2);
  let path = null;
  let json = true;
  let summary = false;
  let check = false;
  let strict = false;
  for (const arg of args) {
    if (arg === "--json") json = true;
    else if (arg === "--summary") { summary = true; json = false; }
    else if (arg === "--check") check = true;
    else if (arg === "--strict") strict = true;
    else if (!arg.startsWith("--")) path = arg;
    else {
      console.error("error: unknown flag " + arg);
      return 2;
    }
  }
  const text = readInput(path);
  const data = parseRateConfirmation(text);
  if (summary) console.log(formatSummary(data));
  else console.log(JSON.stringify(data, null, 2));
  if (check) {
    const missing = [];
    if (!data.loadNumber) missing.push("loadNumber");
    if (!data.origin) missing.push("origin");
    if (!data.destination) missing.push("destination");
    if (data.totalRate == null) missing.push("totalRate");
    if (strict) {
      if (data.linehaul == null) missing.push("linehaul");
      if (data.fuelSurcharge == null) missing.push("fuelSurcharge");
      if (data.miles == null) missing.push("miles");
    }
    if (missing.length) {
      console.error("missing required fields: " + missing.join(", "));
      return 1;
    }
  }
  return 0;
}

if (require.main === module) {
  process.exit(main(process.argv));
}

module.exports = { parseRateConfirmation, parseMoney, parseCityState, formatSummary };
