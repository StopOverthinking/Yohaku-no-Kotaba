"""Build an attributed editorial queue; never publish unreviewed dictionary entries.

Inputs are downloaded separately into output/jlpt-sources. No remote code is run.
The first baseline is immutable so later imports cannot count old words as new.
"""
import gzip
import hashlib
import json
import sys
import unicodedata
import xml.etree.ElementTree as ET
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'output/jlpt-sources'
DEST = ROOT / 'content/jlpt'
EDITOR = ROOT / 'src/features/vocab/editor-data'


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def norm(text):
    return unicodedata.normalize('NFKC', text).strip()


def key(word, reading):
    return norm(word) + '|' + norm(reading)


def main():
    DEST.mkdir(parents=True, exist_ok=True)
    baseline_path = DEST / 'baseline.json'
    if not baseline_path.exists():
        words = read(EDITOR / 'vocabularyWords.json') + read(EDITOR / 'themeWords.json')
        write(baseline_path, {
            'schemaVersion': 1,
            'description': 'Pre-expansion vocabulary; do not regenerate after adding content.',
            'files': {name: hashlib.sha256((EDITOR / name).read_bytes()).hexdigest() for name in
                      ['vocabularyWords.json', 'vocabularySets.json', 'learnContent.json']},
            'words': [{k: w[k] for k in ['id', 'japanese', 'reading', 'type']} for w in words],
        })
    old = read(baseline_path)['words']
    old_keys = {key(w['japanese'], w['reading']) for w in old}
    level_lookup = {}
    for level in [5, 4, 3, 2, 1]:
        for row in read(SOURCE / f'n{level}.json'):
            level_lookup.setdefault(norm(row['word']), []).append(row)

    raw = (SOURCE / 'JMdict_e.gz').read_bytes()
    root = ET.fromstring(gzip.decompress(raw))
    candidates = []
    for entry in root.findall('entry'):
        spellings = [e.text for e in entry.findall('k_ele/keb')]
        readings = [e.text for e in entry.findall('r_ele/reb')]
        if not readings:
            continue
        forms = spellings or readings
        priorities = {e.text for e in entry.findall('.//ke_pri') + entry.findall('.//re_pri')}
        tags = {e.text for e in entry.findall('.//misc')}
        if tags & {'obsolete term', 'archaic', 'rare term'} and not priorities:
            continue
        matches = [m for form in forms for m in level_lookup.get(norm(form), [])
                   if not m['reading'] or norm(m['reading']) in {norm(r) for r in readings}]
        common = bool(priorities & {'ichi1', 'news1', 'spec1', 'gai1'})
        if not matches and not common:
            continue
        # Respect reading restrictions; a spelling/reading Cartesian product is invalid.
        japanese = forms[0]
        compatible = [r for r in entry.findall('r_ele')
                      if not r.findall('re_restr') or japanese in [x.text for x in r.findall('re_restr')]]
        reading = (compatible or entry.findall('r_ele'))[0].findtext('reb')
        levels = sorted({m['level'] for m in matches}, reverse=True)
        matched_forms = sorted({m['word'] for m in matches})
        senses = []
        for sense in entry.findall('sense'):
            senses.append({
                'pos': [p.text for p in sense.findall('pos')],
                'glosses': [g.text for g in sense.findall('gloss') if g.get('{http://www.w3.org/XML/1998/namespace}lang', 'eng') == 'eng'],
                'restrictedSpellings': [r.text for r in sense.findall('stagk')],
                'restrictedReadings': [r.text for r in sense.findall('stagr')],
            })
        overlaps = [w['id'] for w in old if norm(w['japanese']) in {norm(f) for f in forms}
                    and norm(w['reading']) in {norm(r) for r in readings}]
        candidates.append({
            'id': 'jmdict-' + entry.findtext('ent_seq'),
            'japanese': japanese, 'reading': reading,
            'spellings': spellings, 'readings': readings, 'senses': senses,
            'proposedLevel': levels[0] if len(levels) == 1 else None,
            'levelEvidence': {'source': 'openjlpt', 'levels': levels, 'matchedForms': matched_forms},
            'priorities': sorted(priorities), 'existingWordIds': overlaps,
            'status': 'candidate', 'source': 'jmdict',
            'needs': ['korean-meaning', 'level-review', 'sense-selection', 'representative-example', 'content-review'],
        })
    candidates.sort(key=lambda c: (not bool(c['levelEvidence']['levels']), not bool(c['priorities']), c['id']))
    # Retain the complete qualifying pool; editorial quotas never manufacture entries.
    for level in ['N5', 'N4', 'N3', 'N2', 'N1', 'unassigned']:
        write(DEST / 'candidates' / f'{level.lower()}.json', [c for c in candidates if (c['proposedLevel'] or 'unassigned') == level])
    manifest = {
        'schemaVersion': 1,
        'sources': [
            {'id': 'jmdict', 'url': 'https://www.edrdg.org/pub/Nihongo/JMdict_e.gz',
             'sha256': hashlib.sha256(raw).hexdigest(), 'license': 'CC-BY-SA-4.0',
             'licenseUrl': 'https://www.edrdg.org/edrdg/licence.html'},
            {'id': 'openjlpt', **read(SOURCE / 'upstream.json'), 'license': 'CC-BY-SA-4.0',
             'levelOrigin': 'Jonathan Waller, https://www.tanos.co.uk/jlpt/ (CC BY, per upstream NOTICE)'}],
        'baselineRows': len(old), 'baselineSpellingReadingKeys': len(old_keys),
        'candidateEntries': len(candidates),
        'existingMatches': sum(bool(c['existingWordIds']) for c in candidates),
        'unmatchedCandidates': sum(not c['existingWordIds'] for c in candidates),
        'byProposedLevel': {l: sum((c['proposedLevel'] or 'unassigned') == l for c in candidates)
                            for l in ['N5', 'N4', 'N3', 'N2', 'N1', 'unassigned']},
        'note': 'Candidate entry counts are not unique reviewed word counts. Level labels are provisional, never official JLPT classifications.',
    }
    write(DEST / 'candidate-manifest.json', manifest)
    for filename in ['NOTICE.md', 'LICENSE']:
        (DEST / ('UPSTREAM-' + filename)).write_bytes((SOURCE / filename).read_bytes())
    print(json.dumps({k: v for k, v in manifest.items() if k != 'sources'}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
