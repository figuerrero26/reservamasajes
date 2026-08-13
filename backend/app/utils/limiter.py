"""Instancia compartida de rate limiting (evita import circular con app.main)."""
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
