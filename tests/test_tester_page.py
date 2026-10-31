"""12주차 사용성 테스트 페이지의 필수 요소를 검사한다."""

from __future__ import annotations

import unittest
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class IdCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: set[str] = set()
        self.inputs: list[dict[str, str | None]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if values.get("id"):
            self.ids.add(str(values["id"]))
        if tag == "input":
            self.inputs.append(values)


class TesterPageTest(unittest.TestCase):
    def setUp(self) -> None:
        self.html = (ROOT / "docs" / "tester.html").read_text(encoding="utf-8")
        self.parser = IdCollector()
        self.parser.feed(self.html)

    def test_required_controls_exist(self) -> None:
        self.assertTrue({"tester-form", "tester-track", "tester-result", "feedback-output", "copy-feedback"} <= self.parser.ids)

    def test_five_tasks_are_required(self) -> None:
        task_names = {item.get("name") for item in self.parser.inputs if "required" in item}
        self.assertEqual(task_names, {"task1", "task2", "task3", "task4", "task5"})

    def test_form_does_not_send_personal_data(self) -> None:
        self.assertNotIn("action=", self.html)
        self.assertNotIn('type="email"', self.html)
        self.assertIn("어디에도 자동 전송되거나 저장되지 않습니다", self.html)

    def test_career_track_is_available(self) -> None:
        script = (ROOT / "docs" / "tester.js").read_text(encoding="utf-8")
        self.assertIn('label: "JD·취업 준비"', script)
        self.assertIn("지원 작업 저장·백업 위치", script)


if __name__ == "__main__":
    unittest.main()
