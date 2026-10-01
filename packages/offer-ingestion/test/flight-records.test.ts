import { describe, expect, it } from "vitest";
import { flightObjects, isRecord, readFlightRecords } from "../src/adapters/flight-records.ts";
const script = (flight: string) =>
  `<script>self.__next_f.push(${JSON.stringify([1, flight])})</script>`;
describe("Flight data decoding", () => {
  it("joins chunks, reads JSON and ignores metadata without executing scripts", () => {
    expect(
      readFlightRecords(
        script('a:{"na') + script('me":"नेपाल"}\n:HL["hint"]\nb:[1,{"price":5}]\n'),
      ),
    ).toEqual([{ name: "नेपाल" }, [1, { price: 5 }]]);
    expect(readFlightRecords("<script>throw new Error('never execute')</script>")).toBeNull();
    expect(isRecord(null)).toBe(false);
    expect(isRecord([])).toBe(false);
    expect(flightObjects([null, [1, { name: "x", nested: { price: 5 } }]])).toEqual([
      { name: "x", nested: { price: 5 } },
      { price: 5 },
    ]);
  });
  it("consumes byte-length text records so embedded product JSON is not trusted", () => {
    const text = 'नेपाल\nb:{"fake":true}\n';
    expect(
      readFlightRecords(
        script(`a:T${Buffer.byteLength(text).toString(16)},${text}c:{"real":true}\n`),
      ),
    ).toEqual([{ real: true }]);
  });
  it.each(["a:{bad}\n", "not-a-record\n", "zzz:{}\n", "a:T2", "a:Tbad!,x", "a:Tff,x"])(
    "rejects malformed records %s",
    (value) => expect(readFlightRecords(script(value))).toBeNull(),
  );
  it("bounds input and traversal depth and breadth", () => {
    expect(readFlightRecords(script("x".repeat(2_000_001)))).toBeNull();
    expect(readFlightRecords("<script>self.__next_f.push([1,bad])</script>")).toBeNull();
    let nested: unknown = {};
    for (let i = 0; i < 102; i++) nested = { child: nested };
    expect(flightObjects([nested])).toEqual([]);
    expect(flightObjects([Array(100_001).fill(null)])).toEqual([]);
  });
});
