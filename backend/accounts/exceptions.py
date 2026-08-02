# accounts/exceptions.py
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler


def _django_validation_to_errors(exc: DjangoValidationError):
    message_dict = getattr(exc, "message_dict", None)
    if isinstance(message_dict, dict) and message_dict:
        return message_dict

    messages = getattr(exc, "messages", None)
    if isinstance(messages, list) and messages:
        if len(messages) == 1:
            return {"detail": messages[0]}
        return {"detail": messages}

    message = str(exc).strip()
    if message:
        return {"detail": message}
    return {"detail": "Solicitud invalida."}


def _integrity_error_to_detail(exc: IntegrityError) -> str:
    text = str(exc or "")
    text_upper = text.upper()

    if "UNIQUE" in text_upper or "DUPLICATE" in text_upper:
        return "Ya existe un registro con esos datos unicos."
    if "FOREIGN KEY" in text_upper:
        return "No se puede guardar porque hay una relacion invalida."
    if "NOT NULL" in text_upper:
        return "Faltan datos obligatorios para guardar el registro."

    return "No se pudo guardar por una restriccion de integridad."


def _first_field_error_message(field_errors):
    if not isinstance(field_errors, dict):
        return ""

    for value in field_errors.values():
        if isinstance(value, list) and value and isinstance(value[0], str):
            return value[0]
        if isinstance(value, str) and value.strip():
            return value
        if isinstance(value, dict):
            nested = _first_field_error_message(value)
            if nested:
                return nested
    return ""


def exception_handler(exc, context):
    """
    Envuelve todas las respuestas de error en un formato coherente:
    {
      "detail": "...",
      "code": "bad_request|permission_denied|validation_error|server_error",
      "errors": {...}  # solo cuando hay campos
    }
    """
    if isinstance(exc, DjangoValidationError):
        errors = _django_validation_to_errors(exc)
        detail = _first_field_error_message(errors) or errors.get("detail") or "Solicitud invalida."
        payload = {
            "detail": detail,
            "code": "validation_error",
            "errors": errors,
        }
        return Response(payload, status=status.HTTP_400_BAD_REQUEST)

    if isinstance(exc, IntegrityError):
        payload = {
            "detail": _integrity_error_to_detail(exc),
            "code": "bad_request",
        }
        return Response(payload, status=status.HTTP_400_BAD_REQUEST)

    resp = drf_exception_handler(exc, context)
    if resp is None:
        return Response({
            "detail": "Ha ocurrido un error interno.",
            "code": "server_error",
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    payload = {"detail": "", "code": "",}
    status_code = resp.status_code

    if status_code == 400:
        payload["code"] = "bad_request"
    elif status_code == 401:
        payload["code"] = "unauthorized"
    elif status_code == 403:
        payload["code"] = "permission_denied"
    elif status_code == 404:
        payload["code"] = "not_found"
    elif status_code == 429:
        payload["code"] = "too_many_requests"
    else:
        payload["code"] = "error"

    data = resp.data

    if isinstance(data, dict):
        detail = data.get("detail")
        if isinstance(detail, (str,)):
            payload["detail"] = detail
        else:
            payload["detail"] = "Solicitud inválida." if status_code == 400 else payload["code"].replace("_"," ").title()

        field_errors = {k: v for k, v in data.items() if k != "detail"}
        first_field_error = _first_field_error_message(field_errors)
        if first_field_error:
            payload["detail"] = first_field_error
        if field_errors:
            payload["errors"] = field_errors
    else:
        payload["detail"] = str(data)

    return Response(payload, status=status_code)
