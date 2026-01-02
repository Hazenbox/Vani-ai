"""
Pytest Configuration for Vani AI Pipeline Tests

Provides fixtures and configuration for testing the Python pipeline components.
"""

import pytest
from unittest.mock import Mock, MagicMock


@pytest.fixture
def sample_wikipedia_content():
    """Sample Wikipedia article content for testing."""
    return {
        'title': 'Mumbai Indians',
        'content': """Mumbai Indians is a franchise cricket team based in Mumbai, India.

The team competes in the Indian Premier League (IPL) and has won five titles.

Mumbai Indians was founded in 2008 and is owned by Reliance Industries.

== History ==
The franchise was established as part of the inaugural IPL season.

== Achievements ==
Five IPL titles (2013, 2015, 2017, 2019, 2020).

== See also ==
Chennai Super Kings
Kolkata Knight Riders

== References ==
1. IPL Official Website
2. Mumbai Indians Official Site
""",
        'summary': 'Mumbai Indians is a franchise cricket team based in Mumbai, India.'
    }


@pytest.fixture
def sample_script_data():
    """Sample valid script data for testing."""
    return {
        "title": "Mumbai Indians Ka Kahaani",
        "script": [
            {"speaker": "Rahul", "text": "Arey yaar, tune dekha?"},
            {"speaker": "Anjali", "text": "Kya dekha?"},
            {"speaker": "Rahul", "text": "(excited) Mumbai Indians!"},
            {"speaker": "Anjali", "text": "(laughs) Haan, five titles!"},
            {"speaker": "Rahul", "text": "Matlab complete domination hai."},
            {"speaker": "Anjali", "text": "Bilkul sahi kaha."},
            {"speaker": "Rahul", "text": "Rohit Sharma ka captaincy..."},
            {"speaker": "Anjali", "text": "(thinking) Hmm, legendary hai."},
            {"speaker": "Rahul", "text": "Achcha chalo, baad mein baat karte hain."},
            {"speaker": "Anjali", "text": "Haan, bye!"},
        ],
        "source_url": "https://en.wikipedia.org/wiki/Mumbai_Indians"
    }


@pytest.fixture
def mock_elevenlabs_client():
    """Mock ElevenLabs client for TTS testing."""
    mock = MagicMock()
    mock.text_to_speech.convert.return_value = iter([b'audio_chunk_1', b'audio_chunk_2'])
    return mock


@pytest.fixture
def mock_gemini_model():
    """Mock Gemini model for script generation testing."""
    mock = MagicMock()
    mock.generate_content.return_value = MagicMock(
        text='{"title": "Test Title", "script": [{"speaker": "Rahul", "text": "Hello"}, {"speaker": "Anjali", "text": "Hi"}]}'
    )
    return mock


@pytest.fixture
def mock_wikipedia_api():
    """Mock Wikipedia API for content fetching."""
    mock_page = MagicMock()
    mock_page.exists.return_value = True
    mock_page.title = "Mumbai Indians"
    mock_page.text = "Mumbai Indians is a franchise cricket team..."
    mock_page.summary = "Mumbai Indians is a franchise cricket team based in Mumbai."
    
    mock_wiki = MagicMock()
    mock_wiki.page.return_value = mock_page
    return mock_wiki
