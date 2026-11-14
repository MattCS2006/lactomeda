"""Turn GMAT LEO 500 km reports into game values (JSON).

Usage:
    python gmat/parse_leo500.py <GMAT output folder> [--days 7]

Writes gmat/output/leo500.json and prints it.
"""
import argparse
import json
import re
from pathlib import Path

DATE = r"\d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2}\.\d{3}"
EVENT_LINE = re.compile(rf"^\s*({DATE})\s+({DATE})\s+([\d.]+)(.*)$")


def read_events(path: Path):
    """Return a list of (duration_s, rest_of_line) for every event row."""
    events = []
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        m = EVENT_LINE.match(line)
        if m:
            events.append((float(m.group(3)), m.group(4)))
    return events


def read_period_minutes(path: Path) -> float:
    """Last numeric column of the first data row = OrbitPeriod in seconds."""
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        if re.match(rf"^\s*{DATE}", line):
            return float(line.split()[-1]) / 60.0
    raise ValueError(f"No data rows found in {path}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("gmat_output", type=Path)
    ap.add_argument("--days", type=float, default=7.0)
    args = ap.parse_args()
    out = args.gmat_output

    period_min = read_period_minutes(out / "LEO500_Summary.txt")

    eclipses = read_events(out / "LEO500_Eclipses.txt")
    umbra = [d for d, rest in eclipses if "Umbra" in rest and "Antumbra" not in rest]
    penumbra = [d for d, rest in eclipses if "Penumbra" in rest]
    umbra_total_s = sum(umbra)
    total_s = args.days * 86400

    contacts = read_events(out / "LEO500_Contacts.txt")
    contact_total_min = sum(d for d, _ in contacts) / 60.0

    result = {
        "id": "leo-500",
        "altitudeKm": 500,
        "inclinationDeg": 51.6,
        "periodMin": round(period_min, 2),
        "eclipseMaxMinPerOrbit": round(max(umbra) / 60.0, 1) if umbra else 0,
        "eclipseAvgMinPerOrbit": round(umbra_total_s / 60.0 / len(umbra), 1) if umbra else 0,
        "eclipseFraction": round(umbra_total_s / total_s, 3),
        "penumbraMinPerDay": round(sum(penumbra) / 60.0 / args.days, 1),
        "groundStation": "San José, Costa Rica (9.93N, 84.08W, min elev 10°)",
        "passesPerDay": round(len(contacts) / args.days, 1),
        "contactMinPerDay": round(contact_total_min / args.days, 1),
        "avgPassMin": round(contact_total_min / len(contacts), 1) if contacts else 0,
        "source": f"NASA GMAT, gmat/leo500.script, {args.days:g}-day propagation from 2027-01-01",
    }

    dest = Path(__file__).parent / "output" / "leo500.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
