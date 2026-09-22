class NoRoomFound(Exception):
    """404 - room code does not exist."""


class ForbiddenError(Exception):
    """403 - you're not allowed to do that."""


class BadRequestError(Exception):
    """400 - the request itself doesn't make sense."""
