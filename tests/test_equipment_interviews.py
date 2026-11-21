import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('equipment_builder', ROOT/'scripts/build_equipment_interviews.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class EquipmentInterviewTests(unittest.TestCase):
    def setUp(self):
        self.catalog, self.audit = builder.build()
        self.rows = {(r['company'], r['number']): r for r in self.audit['rows']}

    def test_all_numbered_rows_have_one_audit_record(self):
        self.assertEqual(len(self.rows), 1026)
        for company, _, count in builder.COMPANIES:
            self.assertEqual({n for c,n in self.rows if c == company}, set(range(1,count+1)))
        actual = {(s['company'],s['number']) for i in self.catalog['items'] for s in i['sources']}
        self.assertEqual(actual, set(self.rows)-{('asml',95),('asml',96)})
        self.assertEqual(self.catalog['questionRows'],1024)
        self.assertEqual(len(self.catalog['items']),83)
        self.assertTrue(all(0 <= r['screenshotIndex'] < 29 for r in self.rows.values()))
        self.assertEqual(self.rows['lam',291]['page'],30)

    def test_period_boundaries_match_visible_source_changes(self):
        for company,number,before,after in [('amat',15,'2025 하','2026 상'),('amat',132,'2026 상','2026 하'),
                ('asml',41,'2025 상','2025 하'),('asml',193,'2025 하','2026 상'),('asml',270,'2026 상','2026 하'),
                ('tel',44,'2025 상','2025 하'),('tel',59,'2025 하','2026 상'),('tel',180,'2026 상','2026 하'),
                ('lam',54,'2025 상','2025 하'),('lam',81,'2025 하','2026 상'),('lam',157,'2026 상','2026 하')]:
            self.assertEqual(self.rows[company,number]['period'],before)
            self.assertEqual(self.rows[company,number+1]['period'],after)

    def test_distinct_language_requirements_and_combined_intents(self):
        self.assertTrue(self.rows['amat',154]['english'])
        self.assertIn('MV',self.rows['amat',154]['topics'])
        self.assertTrue(self.rows['tel',105]['japaneseRelated'])
        self.assertFalse(self.rows['tel',105]['english'])
        self.assertFalse(self.rows['lam',182]['english'])  # English ability question is not an English-response requirement.
        self.assertIn('SA',self.rows['asml',245]['topics'])
        self.assertIn('SN',self.rows['asml',202]['topics'])

    def test_generated_files_match_and_no_raw_transcript_is_published(self):
        self.assertEqual(json.loads((ROOT/'docs/interview/equipment.json').read_text(encoding='utf-8')),self.catalog)
        self.assertEqual(json.loads((ROOT/'config/equipment_interview_audit.json').read_text(encoding='utf-8')),self.audit)
        self.assertTrue(all('question' not in s and 'text' not in s for i in self.catalog['items'] for s in i['sources']))
        self.assertEqual(self.catalog['sourceType'],'reported-interview-compilation')


if __name__ == '__main__':
    unittest.main()
