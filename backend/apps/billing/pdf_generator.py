from __future__ import annotations

from decimal import Decimal
from io import BytesIO
from typing import Iterable

from django.utils import timezone

from apps.billing.models import Charge, CreditNote, Invoice, Payment


def _to_decimal(value: object) -> Decimal:
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except Exception:
        return Decimal("0")


def _format_currency(value: object) -> str:
    amount = _to_decimal(value)
    formatted = f"{amount:,.2f}"
    normalized = formatted.replace(",", "X").replace(".", ",").replace("X", ".")
    return f"$ {normalized}"


def _format_datetime(value: object) -> str:
    if value is None:
        return "--"

    if hasattr(value, "hour"):
        dt = value
        if timezone.is_aware(dt):
            dt = timezone.localtime(dt)
        return dt.strftime("%d/%m/%Y %H:%M")

    if hasattr(value, "year"):
        return value.strftime("%d/%m/%Y")

    return str(value)


def _resolve_hotel_name(invoice: Invoice) -> str:
    reservation = invoice.reservation
    if not reservation:
        return "Gestion Hotelera"

    for detail in reservation.rooms_detail.select_related("room__floor__hotel_settings"):
        hotel_settings = getattr(getattr(getattr(detail, "room", None), "floor", None), "hotel_settings", None)
        hotel_name = str(getattr(hotel_settings, "hotel_name", "") or "").strip()
        if hotel_name:
            return hotel_name

    return "Gestion Hotelera"


def _build_invoice_info_rows(invoice: Invoice) -> list[list[str]]:
    reservation = invoice.reservation
    client = getattr(reservation, "client", None)

    room_numbers = []
    for detail in reservation.rooms_detail.select_related("room"):
        number = str(getattr(getattr(detail, "room", None), "number", "") or "").strip()
        if number:
            room_numbers.append(number)

    rooms_label = ", ".join(room_numbers) if room_numbers else "--"

    return [
        ["Factura No.", invoice.invoice_number or f"FAC-{invoice.id}", "Estado", str(getattr(invoice.status, "name", "") or "--")],
        ["Fecha emision", _format_datetime(invoice.issue_date), "Reserva", f"#{reservation.id}"],
        ["Cliente", str(getattr(client, "full_name", "") or "--"), "Documento", str(getattr(client, "document_number", "") or "--")],
        ["Correo", str(getattr(client, "email", "") or "--"), "Telefono", str(getattr(client, "phone", "") or "--")],
        ["Check-in", _format_datetime(getattr(reservation, "expected_check_in", None)), "Check-out", _format_datetime(getattr(reservation, "expected_check_out", None))],
        ["Habitaciones", rooms_label, "Origen", str(getattr(getattr(reservation, "origin", None), "name", "") or "--")],
    ]


def build_invoice_pdf(
    invoice: Invoice,
    charges: Iterable[Charge],
    payments: Iterable[Payment],
    credit_notes: Iterable[CreditNote],
) -> bytes:
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import mm
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    except Exception as exc:
        raise RuntimeError("La libreria 'reportlab' es requerida para generar PDF. Ejecuta: pip install reportlab") from exc

    charges_list = list(charges)
    payments_list = list(payments)
    credit_notes_list = list(credit_notes)

    subtotal = _to_decimal(invoice.subtotal)
    tax_amount = _to_decimal(invoice.tax_amount)
    total_amount = _to_decimal(invoice.total_amount)
    total_paid = sum((_to_decimal(payment.amount) for payment in payments_list), Decimal("0"))
    total_credit_notes = sum((_to_decimal(note.amount) for note in credit_notes_list), Decimal("0"))
    pending_amount = total_amount - total_paid - total_credit_notes
    if pending_amount < 0:
        pending_amount = Decimal("0")

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=f"Factura {invoice.invoice_number or invoice.id}",
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "InvoiceTitle",
        parent=styles["Heading1"],
        fontSize=18,
        leading=22,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=3,
    )
    subtitle_style = ParagraphStyle(
        "InvoiceSubtitle",
        parent=styles["Normal"],
        fontSize=10,
        leading=13,
        textColor=colors.HexColor("#475569"),
    )
    section_style = ParagraphStyle(
        "SectionTitle",
        parent=styles["Heading3"],
        fontSize=11,
        leading=14,
        textColor=colors.HexColor("#1e293b"),
        spaceAfter=6,
        spaceBefore=10,
    )

    story = [
        Paragraph(_resolve_hotel_name(invoice), title_style),
        Paragraph("Factura de venta", subtitle_style),
        Spacer(1, 4 * mm),
    ]

    invoice_info_table = Table(
        _build_invoice_info_rows(invoice),
        colWidths=[24 * mm, 60 * mm, 24 * mm, 60 * mm],
    )
    invoice_info_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (3, -1), colors.HexColor("#f8fafc")),
                ("INNERGRID", (0, 0), (3, -1), 0.25, colors.HexColor("#e2e8f0")),
                ("BOX", (0, 0), (3, -1), 0.6, colors.HexColor("#cbd5e1")),
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
                ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#334155")),
                ("TEXTCOLOR", (2, 0), (2, -1), colors.HexColor("#334155")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.append(invoice_info_table)

    story.append(Paragraph("Detalle de cargos", section_style))
    charge_rows = [
        ["Descripcion", "Tipo", "Fecha", "Cant.", "Vr unitario", "Total"],
    ]
    for charge in charges_list:
        charge_rows.append(
            [
                str(charge.description or "--"),
                str(getattr(getattr(charge, "charge_type", None), "name", "") or "--"),
                _format_datetime(charge.charge_date),
                str(int(charge.quantity or 0)),
                _format_currency(charge.unit_price),
                _format_currency(charge.total_amount),
            ]
        )

    if len(charge_rows) == 1:
        charge_rows.append(["Sin cargos activos", "", "", "", "", ""])

    charges_table = Table(
        charge_rows,
        colWidths=[52 * mm, 24 * mm, 28 * mm, 14 * mm, 24 * mm, 26 * mm],
        repeatRows=1,
    )
    charge_style = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f3f73")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 1), (-1, -1), 8.5),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#cbd5e1")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("ALIGN", (3, 1), (5, -1), "RIGHT"),
    ]
    if len(charge_rows) == 2 and charge_rows[1][0] == "Sin cargos activos":
        charge_style.append(("SPAN", (0, 1), (5, 1)))
        charge_style.append(("ALIGN", (0, 1), (5, 1), "CENTER"))
    charges_table.setStyle(TableStyle(charge_style))
    story.append(charges_table)

    story.append(Paragraph("Pagos aplicados", section_style))
    payment_rows = [["Metodo", "Fecha", "Referencia", "Monto"]]
    for payment in payments_list:
        payment_rows.append(
            [
                str(getattr(getattr(payment, "payment_method", None), "name", "") or "--"),
                _format_datetime(payment.payment_date),
                str(payment.reference or "--"),
                _format_currency(payment.amount),
            ]
        )
    if len(payment_rows) == 1:
        payment_rows.append(["Sin pagos registrados", "", "", ""])

    payments_table = Table(
        payment_rows,
        colWidths=[50 * mm, 36 * mm, 46 * mm, 36 * mm],
        repeatRows=1,
    )
    payment_style = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#14532d")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#cbd5e1")),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("ALIGN", (3, 1), (3, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]
    if len(payment_rows) == 2 and payment_rows[1][0] == "Sin pagos registrados":
        payment_style.append(("SPAN", (0, 1), (3, 1)))
        payment_style.append(("ALIGN", (0, 1), (3, 1), "CENTER"))
    payments_table.setStyle(TableStyle(payment_style))
    story.append(payments_table)

    story.append(Spacer(1, 4 * mm))
    summary_rows = [
        ["Subtotal", _format_currency(subtotal)],
        ["IVA", _format_currency(tax_amount)],
        ["Total factura", _format_currency(total_amount)],
        ["Pagos aplicados", _format_currency(total_paid)],
        ["Notas de credito", _format_currency(total_credit_notes)],
        ["Saldo pendiente", _format_currency(pending_amount)],
    ]
    summary_table = Table(summary_rows, colWidths=[110 * mm, 58 * mm], hAlign="RIGHT")
    summary_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#cbd5e1")),
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#334155")),
                ("FONTNAME", (0, 2), (-1, 2), "Helvetica-Bold"),
                ("FONTNAME", (0, 5), (-1, 5), "Helvetica-Bold"),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(summary_table)

    invoice_notes = str(invoice.notes or "").strip()
    if invoice_notes:
        story.append(Paragraph("Notas", section_style))
        notes_table = Table([[invoice_notes]], colWidths=[168 * mm])
        notes_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (0, 0), colors.HexColor("#f8fafc")),
                    ("BOX", (0, 0), (0, 0), 0.25, colors.HexColor("#cbd5e1")),
                    ("FONTNAME", (0, 0), (0, 0), "Helvetica"),
                    ("FONTSIZE", (0, 0), (0, 0), 9),
                    ("LEFTPADDING", (0, 0), (0, 0), 6),
                    ("RIGHTPADDING", (0, 0), (0, 0), 6),
                    ("TOPPADDING", (0, 0), (0, 0), 6),
                    ("BOTTOMPADDING", (0, 0), (0, 0), 6),
                ]
            )
        )
        story.append(notes_table)

    doc.build(story)
    pdf = buffer.getvalue()
    buffer.close()
    return pdf
