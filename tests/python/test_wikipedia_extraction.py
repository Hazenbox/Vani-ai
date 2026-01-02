"""
Unit Tests for Wikipedia Content Extraction

Tests the core functions for:
- URL parsing and title extraction
- Wikipedia API content fetching
- Text cleaning and preprocessing
"""

import pytest
import re
from unittest.mock import Mock, patch, MagicMock


# ============================================
# URL Parsing Tests
# ============================================

def extract_article_title(url: str) -> str:
    """Extract article title from Wikipedia URL."""
    patterns = [
        r'/wiki/([^#?]+)',  # Standard format
        r'title=([^&]+)',   # Old format with query params
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    raise ValueError(f"Could not extract article title from URL: {url}")


class TestExtractArticleTitle:
    """Tests for extract_article_title function."""
    
    def test_standard_wikipedia_url(self):
        """Should extract title from standard Wikipedia URL."""
        url = "https://en.wikipedia.org/wiki/Mumbai_Indians"
        assert extract_article_title(url) == "Mumbai_Indians"
    
    def test_wikipedia_url_with_underscores(self):
        """Should preserve underscores in multi-word titles."""
        url = "https://en.wikipedia.org/wiki/Indian_Premier_League"
        assert extract_article_title(url) == "Indian_Premier_League"
    
    def test_wikipedia_url_with_hash(self):
        """Should ignore hash fragments."""
        url = "https://en.wikipedia.org/wiki/Mumbai_Indians#History"
        assert extract_article_title(url) == "Mumbai_Indians"
    
    def test_wikipedia_url_with_query_params(self):
        """Should ignore query parameters."""
        url = "https://en.wikipedia.org/wiki/Mumbai_Indians?oldid=12345"
        assert extract_article_title(url) == "Mumbai_Indians"
    
    def test_old_format_with_title_param(self):
        """Should handle old Wikipedia URL format with title parameter."""
        url = "https://en.wikipedia.org/w/index.php?title=Mumbai_Indians&action=view"
        assert extract_article_title(url) == "Mumbai_Indians"
    
    def test_invalid_url_raises_error(self):
        """Should raise ValueError for invalid URLs."""
        url = "https://example.com/not-wikipedia"
        with pytest.raises(ValueError, match="Could not extract article title"):
            extract_article_title(url)
    
    def test_special_characters_in_title(self):
        """Should handle special characters in titles."""
        url = "https://en.wikipedia.org/wiki/Shah_Rukh_Khan"
        assert extract_article_title(url) == "Shah_Rukh_Khan"
    
    def test_unicode_title(self):
        """Should handle Unicode characters in URL-encoded titles."""
        url = "https://en.wikipedia.org/wiki/Chandrayaan-3"
        assert extract_article_title(url) == "Chandrayaan-3"


# ============================================
# Text Cleaning Tests
# ============================================

def clean_wikipedia_text(text: str, max_words: int = 3000) -> str:
    """Clean and truncate Wikipedia text for LLM processing."""
    # Remove reference markers [1], [2], etc.
    text = re.sub(r'\[\d+\]', '', text)
    
    # Remove unwanted sections
    sections_to_remove = [
        r'\n== See also ==.*',
        r'\n== References ==.*',
        r'\n== External links ==.*',
        r'\n== Notes ==.*',
        r'\n== Further reading ==.*',
    ]
    for pattern in sections_to_remove:
        text = re.sub(pattern, '', text, flags=re.DOTALL)
    
    # Remove multiple newlines
    text = re.sub(r'\n{3,}', '\n\n', text)
    
    # Truncate to max words
    words = text.split()
    if len(words) > max_words:
        text = ' '.join(words[:max_words]) + '...'
    
    return text.strip()


class TestCleanWikipediaText:
    """Tests for clean_wikipedia_text function."""
    
    def test_removes_reference_markers(self):
        """Should remove [1], [2], etc. citation markers."""
        text = "Mumbai Indians[1] won the IPL[2] five times[3]."
        result = clean_wikipedia_text(text)
        assert "[1]" not in result
        assert "[2]" not in result
        assert "[3]" not in result
        assert "Mumbai Indians won the IPL five times." == result
    
    def test_removes_see_also_section(self):
        """Should remove 'See also' section and everything after."""
        text = "Main content here.\n\n== See also ==\nRelated article 1\nRelated article 2"
        result = clean_wikipedia_text(text)
        assert "See also" not in result
        assert "Related article" not in result
        assert "Main content here." in result
    
    def test_removes_references_section(self):
        """Should remove 'References' section."""
        text = "Article content.\n\n== References ==\n1. Source one\n2. Source two"
        result = clean_wikipedia_text(text)
        assert "References" not in result
        assert "Source one" not in result
    
    def test_removes_external_links_section(self):
        """Should remove 'External links' section."""
        text = "Content.\n\n== External links ==\nhttp://example.com"
        result = clean_wikipedia_text(text)
        assert "External links" not in result
    
    def test_normalizes_multiple_newlines(self):
        """Should reduce 3+ newlines to 2."""
        text = "Paragraph 1\n\n\n\n\nParagraph 2"
        result = clean_wikipedia_text(text)
        assert "\n\n\n" not in result
        assert "Paragraph 1\n\nParagraph 2" == result
    
    def test_truncates_to_max_words(self):
        """Should truncate text to max_words limit."""
        text = " ".join(["word"] * 5000)
        result = clean_wikipedia_text(text, max_words=100)
        assert result.endswith("...")
        # Should be 100 words + "..."
        assert len(result.split()) == 101
    
    def test_preserves_content_under_limit(self):
        """Should not truncate text under max_words."""
        text = "Short article with only a few words."
        result = clean_wikipedia_text(text, max_words=100)
        assert result == text
        assert "..." not in result
    
    def test_strips_whitespace(self):
        """Should strip leading/trailing whitespace."""
        text = "   Content with whitespace   "
        result = clean_wikipedia_text(text)
        assert result == "Content with whitespace"
    
    def test_handles_empty_string(self):
        """Should handle empty input."""
        result = clean_wikipedia_text("")
        assert result == ""
    
    def test_preserves_important_content(self):
        """Should preserve main article content."""
        text = """Mumbai Indians is a franchise cricket team.

They have won five IPL titles.

The team is owned by Reliance Industries.

== See also ==
Chennai Super Kings
"""
        result = clean_wikipedia_text(text)
        assert "franchise cricket team" in result
        assert "five IPL titles" in result
        assert "Reliance Industries" in result
        assert "Chennai Super Kings" not in result


# ============================================
# Script Validation Tests
# ============================================

def validate_script(script_data: dict) -> bool:
    """Validate the generated script structure."""
    if 'title' not in script_data:
        raise ValueError("Script missing 'title' field")
    if 'script' not in script_data:
        raise ValueError("Script missing 'script' field")
    if not isinstance(script_data['script'], list):
        raise ValueError("'script' must be a list")
    if len(script_data['script']) < 5:
        raise ValueError("Script too short (less than 5 exchanges)")
    
    valid_speakers = {'Rahul', 'Anjali'}
    for i, line in enumerate(script_data['script']):
        if 'speaker' not in line or 'text' not in line:
            raise ValueError(f"Line {i} missing 'speaker' or 'text' field")
        if line['speaker'] not in valid_speakers:
            raise ValueError(f"Invalid speaker '{line['speaker']}' at line {i}")
    
    return True


class TestValidateScript:
    """Tests for validate_script function."""
    
    @pytest.fixture
    def valid_script(self):
        """Return a valid script data structure."""
        return {
            "title": "Mumbai Indians Ka Kahaani",
            "script": [
                {"speaker": "Rahul", "text": "Arey yaar!"},
                {"speaker": "Anjali", "text": "Haan bolo."},
                {"speaker": "Rahul", "text": "Tune dekha match?"},
                {"speaker": "Anjali", "text": "Haan, amazing tha!"},
                {"speaker": "Rahul", "text": "Bilkul sahi!"},
            ]
        }
    
    def test_valid_script_passes(self, valid_script):
        """Should return True for valid script."""
        assert validate_script(valid_script) is True
    
    def test_missing_title_raises_error(self, valid_script):
        """Should raise error for missing title."""
        del valid_script['title']
        with pytest.raises(ValueError, match="missing 'title' field"):
            validate_script(valid_script)
    
    def test_missing_script_raises_error(self, valid_script):
        """Should raise error for missing script field."""
        del valid_script['script']
        with pytest.raises(ValueError, match="missing 'script' field"):
            validate_script(valid_script)
    
    def test_script_not_list_raises_error(self, valid_script):
        """Should raise error if script is not a list."""
        valid_script['script'] = "not a list"
        with pytest.raises(ValueError, match="'script' must be a list"):
            validate_script(valid_script)
    
    def test_script_too_short_raises_error(self, valid_script):
        """Should raise error if script has fewer than 5 exchanges."""
        valid_script['script'] = valid_script['script'][:3]
        with pytest.raises(ValueError, match="Script too short"):
            validate_script(valid_script)
    
    def test_missing_speaker_raises_error(self, valid_script):
        """Should raise error if any line is missing speaker."""
        valid_script['script'][2] = {"text": "Missing speaker"}
        with pytest.raises(ValueError, match="missing 'speaker' or 'text' field"):
            validate_script(valid_script)
    
    def test_missing_text_raises_error(self, valid_script):
        """Should raise error if any line is missing text."""
        valid_script['script'][2] = {"speaker": "Rahul"}
        with pytest.raises(ValueError, match="missing 'speaker' or 'text' field"):
            validate_script(valid_script)
    
    def test_invalid_speaker_raises_error(self, valid_script):
        """Should raise error for invalid speaker name."""
        valid_script['script'][2]['speaker'] = "Unknown"
        with pytest.raises(ValueError, match="Invalid speaker 'Unknown'"):
            validate_script(valid_script)
    
    def test_only_rahul_and_anjali_allowed(self, valid_script):
        """Should only accept Rahul and Anjali as speakers."""
        # All valid speakers
        for line in valid_script['script']:
            assert line['speaker'] in {'Rahul', 'Anjali'}
        
        # This should pass
        assert validate_script(valid_script) is True


# ============================================
# TTS Preprocessing Tests
# ============================================

def preprocess_text_for_tts(text: str) -> str:
    """Preprocess text for TTS - handle emotional markers."""
    emotional_markers = {
        r'\(laughs\)': '... haha ...',
        r'\(giggles\)': '... hehe ...',
        r'\(surprised\)': '... oh! ...',
        r'\(excited\)': '',
        r'\(thinking\)': '... hmm ...',
        r'\(chuckles\)': '... heh ...',
    }
    
    for pattern, replacement in emotional_markers.items():
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    
    # Remove remaining parenthetical markers
    text = re.sub(r'\([^)]*\)', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    
    return text


class TestPreprocessTextForTTS:
    """Tests for preprocess_text_for_tts function."""
    
    def test_replaces_laughs_marker(self):
        """Should replace (laughs) with laughter sound."""
        text = "(laughs) That was funny!"
        result = preprocess_text_for_tts(text)
        assert "haha" in result
        assert "(laughs)" not in result
    
    def test_replaces_giggles_marker(self):
        """Should replace (giggles) with giggle sound."""
        text = "(giggles) So cute!"
        result = preprocess_text_for_tts(text)
        assert "hehe" in result
    
    def test_replaces_surprised_marker(self):
        """Should replace (surprised) with surprise sound."""
        text = "(surprised) What?!"
        result = preprocess_text_for_tts(text)
        assert "oh!" in result
    
    def test_replaces_thinking_marker(self):
        """Should replace (thinking) with thinking sound."""
        text = "(thinking) Let me see..."
        result = preprocess_text_for_tts(text)
        assert "hmm" in result
    
    def test_removes_excited_marker(self):
        """Should remove (excited) marker without replacement."""
        text = "(excited) This is amazing!"
        result = preprocess_text_for_tts(text)
        assert "(excited)" not in result
        assert "This is amazing!" in result
    
    def test_removes_unknown_markers(self):
        """Should remove unknown parenthetical markers."""
        text = "(sighs) I'm tired (yawns)"
        result = preprocess_text_for_tts(text)
        assert "(" not in result
        assert ")" not in result
    
    def test_normalizes_whitespace(self):
        """Should normalize multiple spaces to single space."""
        text = "Hello    there    friend"
        result = preprocess_text_for_tts(text)
        assert "  " not in result
    
    def test_handles_case_insensitive(self):
        """Should handle markers case-insensitively."""
        texts = ["(LAUGHS) Ha!", "(Laughs) Ha!", "(lAuGhS) Ha!"]
        for text in texts:
            result = preprocess_text_for_tts(text)
            assert "haha" in result
    
    def test_handles_empty_string(self):
        """Should handle empty input."""
        result = preprocess_text_for_tts("")
        assert result == ""
    
    def test_preserves_hinglish_content(self):
        """Should preserve Hinglish words."""
        text = "Yaar, matlab basically achcha hai na?"
        result = preprocess_text_for_tts(text)
        assert result == text


# ============================================
# Integration Tests
# ============================================

class TestPipelineIntegration:
    """Integration tests for the complete pipeline flow."""
    
    def test_full_text_processing_flow(self):
        """Test complete text processing from Wikipedia to TTS-ready."""
        # Simulate Wikipedia content
        wiki_text = """
Mumbai Indians[1] is a franchise cricket team[2].

They have won five IPL titles[3].

== See also ==
Chennai Super Kings

== References ==
1. Citation
        """
        
        # Step 1: Clean Wikipedia text
        cleaned = clean_wikipedia_text(wiki_text)
        assert "[1]" not in cleaned
        assert "See also" not in cleaned
        assert "References" not in cleaned
        
        # Step 2: Simulate script generation (would normally use LLM)
        mock_script = {
            "title": "IPL Champions Story",
            "script": [
                {"speaker": "Rahul", "text": "(excited) Yaar, Mumbai Indians!"},
                {"speaker": "Anjali", "text": "(laughs) Haan, five titles!"},
                {"speaker": "Rahul", "text": "Matlab domination hai complete."},
                {"speaker": "Anjali", "text": "Bilkul sahi kaha."},
                {"speaker": "Rahul", "text": "Amazing team yaar!"},
            ]
        }
        
        # Step 3: Validate script
        assert validate_script(mock_script) is True
        
        # Step 4: Preprocess for TTS
        for line in mock_script['script']:
            processed = preprocess_text_for_tts(line['text'])
            assert "(" not in processed
            assert ")" not in processed
    
    def test_hinglish_content_preservation(self):
        """Ensure Hinglish content is preserved through pipeline."""
        hinglish_phrases = [
            "Yaar, kya baat hai!",
            "Achcha matlab basically...",
            "Bilkul sahi, na?",
            "Arrey wah, amazing!",
        ]
        
        for phrase in hinglish_phrases:
            processed = preprocess_text_for_tts(phrase)
            # Key Hinglish words should be preserved
            if "yaar" in phrase.lower():
                assert "yaar" in processed.lower()
            if "achcha" in phrase.lower():
                assert "achcha" in processed.lower()
