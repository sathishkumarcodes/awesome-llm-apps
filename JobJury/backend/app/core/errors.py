"""Domain errors mapped to HTTP responses in app.main."""


class AppError(Exception):
    status_code = 400

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class NotFoundError(AppError):
    status_code = 404


class InvalidFileError(AppError):
    status_code = 415


class FileTooLargeError(AppError):
    status_code = 413


class LLMUnavailableError(AppError):
    status_code = 503


class LLMOutputError(AppError):
    """The LLM repeatedly returned output that could not be validated."""

    status_code = 502
