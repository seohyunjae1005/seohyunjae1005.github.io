import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('interview_catalog_builder',ROOT/'scripts/build_interview_catalog.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

class InterviewCatalogTests(unittest.TestCase):
    def test_catalog_preserves_all_source_links(self):
        source = json.loads((ROOT/'config/interview_source_metadata.json').read_text(encoding='utf-8'))
        actual = json.loads((ROOT/'docs/interview/catalog.json').read_text(encoding='utf-8'))
        self.assertEqual(builder.build(source),actual)
        self.assertEqual(len(actual['items']),182)
        self.assertEqual({row['url'] for row in source['items']},{row['url'] for row in actual['items']})
        self.assertTrue(all(row['bodyIncluded'] is False for row in actual['items']))

    def test_duplicate_extension_is_an_alias_not_another_article(self):
        self.assertEqual(builder.canonical_filename('training-dram-01.md.md'),'training-dram-01.md')
        self.assertEqual(builder.canonical_filename('guide-one-minute-intro.md'),'guide-one-minute-intro.md')

    def test_unknown_material_is_not_silently_classified(self):
        with self.assertRaises(ValueError):
            builder.classify('unreviewed-material.md')

    def test_cross_cutting_topics_are_explicit(self):
        self.assertEqual(builder.classify('master-session-2-07-vacuum.md'),('vacuum',['deposition']))
        self.assertEqual(builder.classify('jeongjuhaeng-metal-03-schottky-ohmic.md'),('contact',['metal']))
        self.assertEqual(builder.classify('jeongjuhaeng-photo-tutor-07-lowk1.md'),('photo',[]))

    def test_process_order_preserves_originals_and_attaches_supplements(self):
        source = json.loads((ROOT/'config/interview_source_metadata.json').read_text(encoding='utf-8'))
        catalog = builder.build(source)
        originals = {row['url']: row['title'] for row in source['items']}
        self.assertTrue(all(row['originalTitle'] == originals[row['url']] for row in catalog['items']))
        self.assertNotIn('studyGuide',catalog)
        self.assertEqual(catalog['items'][0]['postId'],'239')
        section_order={row['id']:index for index,row in enumerate(catalog['sections'])}
        order=[section_order[row['section']] for row in catalog['items']]
        self.assertEqual(order,sorted(order))
        self.assertEqual({row['postId'] for row in catalog['items'] if 'supplements' in row},{'308','172','196','197','213','283'})
        self.assertFalse(any('reviewNote' in row for row in catalog['items']))

if __name__ == '__main__':
    unittest.main()
