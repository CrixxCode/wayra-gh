from django.core.exceptions import ValidationError
from django.db import models

from apps.master_data.models import MasterData
from apps.packages.models import Package
from apps.reservations.models import Reservation
from apps.services.models import Service

class Charge(models.Model):
    reservation = models.ForeignKey(
        Reservation,
        on_delete=models.CASCADE,
        related_name="charges",
    )
    charge_type = models.ForeignKey(
        MasterData,
        on_delete=models.PROTECT,
        related_name="charges_by_type",
        limit_choices_to={"group": MasterData.Group.CHARGE_TYPE},
    )
    service = models.ForeignKey(
        Service,
        on_delete=models.SET_NULL,
        related_name="charges",
        blank=True,
        null=True,
    )
    package = models.ForeignKey(
        Package,
        on_delete=models.SET_NULL,
        related_name="charges",
        blank=True,
        null=True,
    )

    description = models.CharField(max_length=255)
    quantity = models.PositiveIntegerField(default=1)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    total_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    charge_date = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)
    is_automatic = models.BooleanField(default=False, db_index=True)
    automation_key = models.CharField(max_length=80, blank=True, null=True, db_index=True)

    class Meta:
        db_table = "charge"
        ordering = ["-id"]

    @property
    def charge_type_code(self):
        return self.charge_type.code if self.charge_type else None

    def clean(self):
        errors = {}

        if self.quantity < 1:
            errors["quantity"] = "Quantity must be at least 1."

        if self.unit_price is not None and self.unit_price < 0:
            errors["unit_price"] = "Unit price cannot be negative."

        if self.total_amount is not None and self.total_amount < 0:
            errors["total_amount"] = "Total amount cannot be negative."

        if self.service and self.package:
            errors["package"] = "A charge should reference either a service or a package, not both."

        reservation_hotel_id = getattr(getattr(self, "reservation", None), "hotel_settings_id", None)
        if self.service and reservation_hotel_id and self.service.hotel_settings_id != reservation_hotel_id:
            errors["service"] = "The service must belong to the same hotel as the reservation."

        if self.package and reservation_hotel_id and self.package.hotel_settings_id != reservation_hotel_id:
            errors["package"] = "The package must belong to the same hotel as the reservation."

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.total_amount = (self.quantity or 0) * (self.unit_price or 0)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Charge #{self.id} - Reservation #{self.reservation_id}"


class Invoice(models.Model):
    reservation = models.ForeignKey(
        Reservation,
        on_delete=models.CASCADE,
        related_name="invoices",
    )
    status = models.ForeignKey(
        MasterData,
        on_delete=models.PROTECT,
        related_name="invoices_by_status",
        limit_choices_to={"group": MasterData.Group.INVOICE_STATUS},
    )
    invoice_number = models.CharField(max_length=50, unique=True)
    issue_date = models.DateTimeField(auto_now_add=True)

    subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    notes = models.TextField(blank=True, null=True)
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "invoice"
        ordering = ["-id"]

    @property
    def status_code(self):
        return self.status.code if self.status else None

    def clean(self):
        errors = {}

        if self.subtotal is not None and self.subtotal < 0:
            errors["subtotal"] = "Subtotal cannot be negative."

        if self.tax_amount is not None and self.tax_amount < 0:
            errors["tax_amount"] = "Tax amount cannot be negative."

        if self.total_amount is not None and self.total_amount < 0:
            errors["total_amount"] = "Total amount cannot be negative."

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.total_amount = (self.subtotal or 0) + (self.tax_amount or 0)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Invoice {self.invoice_number} - Reservation #{self.reservation_id}"


class InvoiceCharge(models.Model):
    invoice = models.ForeignKey(
        Invoice,
        on_delete=models.CASCADE,
        related_name="invoice_charges",
    )
    charge = models.ForeignKey(
        "billing.Charge",
        on_delete=models.PROTECT,
        related_name="invoice_links",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "invoice_charge"
        ordering = ["id"]
        unique_together = ("invoice", "charge")

    def clean(self):
        errors = {}

        if self.invoice and self.charge:
            if self.invoice.reservation_id != self.charge.reservation_id:
                errors["charge"] = "The charge must belong to the same reservation as the invoice."

        if errors:
            raise ValidationError(errors)

    def __str__(self):
        return f"{self.invoice.invoice_number} - Charge #{self.charge_id}"

class Payment(models.Model):
    invoice = models.ForeignKey(
        "billing.Invoice",
        on_delete=models.CASCADE,
        related_name="payments",
    )
    payment_method = models.ForeignKey(
        MasterData,
        on_delete=models.PROTECT,
        related_name="payments_by_method",
        limit_choices_to={"group": MasterData.Group.PAYMENT_METHOD},
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    payment_date = models.DateTimeField(auto_now_add=True)
    reference = models.CharField(max_length=100, blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "payment"
        ordering = ["-id"]

    @property
    def payment_method_code(self):
        return self.payment_method.code if self.payment_method else None

    def clean(self):
        errors = {}

        if self.amount is not None and self.amount <= 0:
            errors["amount"] = "Payment amount must be greater than 0."

        if self.invoice and self.amount:
            total_paid = sum(
                payment.amount
                for payment in self.invoice.payments.filter(is_active=True).exclude(pk=self.pk)
            )
            total_processed_refunds = sum(
                refund.amount
                for refund in PaymentRefund.objects.filter(
                    payment__invoice=self.invoice,
                    is_active=True,
                    status__code__in=["APROBADO", "PROCESADO"],
                ).only("amount")
            )

            net_paid = total_paid - total_processed_refunds
            if net_paid < 0:
                net_paid = 0

            pending_balance = self.invoice.total_amount - net_paid
            if pending_balance < 0:
                pending_balance = 0

            if self.amount > pending_balance:
                errors["amount"] = "Payment amount cannot be greater than the pending balance."

        if errors:
            raise ValidationError(errors)

    def __str__(self):
        return f"Payment #{self.id} - Invoice {self.invoice.invoice_number}"


class PaymentRefund(models.Model):
    payment = models.ForeignKey(
        "billing.Payment",
        on_delete=models.CASCADE,
        related_name="refunds",
    )
    status = models.ForeignKey(
        MasterData,
        on_delete=models.PROTECT,
        related_name="payment_refunds_by_status",
        limit_choices_to={"group": MasterData.Group.PAYMENT_REFUND_STATUS},
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    reason = models.TextField()
    refund_date = models.DateTimeField(auto_now_add=True)
    reference = models.CharField(max_length=100, blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "payment_refund"
        ordering = ["-id"]

    @property
    def status_code(self):
        return self.status.code if self.status else None

    @property
    def invoice(self):
        return self.payment.invoice if self.payment else None

    @property
    def payment_method(self):
        return self.payment.payment_method if self.payment else None

    def clean(self):
        errors = {}

        if self.amount is not None and self.amount <= 0:
            errors["amount"] = "Refund amount must be greater than 0."

        if self.payment and not self.payment.is_active:
            errors["payment"] = "Cannot register a refund for an inactive payment."

        if self.payment and self.amount:
            reserved_refunds = sum(
                refund.amount
                for refund in PaymentRefund.objects.filter(
                    payment=self.payment,
                    is_active=True,
                )
                .exclude(pk=self.pk)
                .exclude(status__code__in=["RECHAZADO", "ANULADO"])
                .only("amount")
            )
            available_amount = self.payment.amount - reserved_refunds
            if available_amount < 0:
                available_amount = 0

            if self.amount > available_amount:
                errors["amount"] = "Refund amount cannot be greater than the refundable payment balance."

        if errors:
            raise ValidationError(errors)

    def __str__(self):
        invoice_number = getattr(getattr(self.payment, "invoice", None), "invoice_number", "--")
        return f"Refund #{self.id} - Invoice {invoice_number}"


class CreditNote(models.Model):
    invoice = models.ForeignKey(
        "billing.Invoice",
        on_delete=models.CASCADE,
        related_name="credit_notes",
    )
    status = models.ForeignKey(
        MasterData,
        on_delete=models.PROTECT,
        related_name="credit_notes_by_status",
        limit_choices_to={"group": MasterData.Group.CREDIT_NOTE_STATUS},
    )
    credit_note_number = models.CharField(max_length=50, unique=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    reason = models.TextField()
    issue_date = models.DateTimeField(auto_now_add=True)
    notes = models.TextField(blank=True, null=True)
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "credit_note"
        ordering = ["-id"]

    @property
    def status_code(self):
        return self.status.code if self.status else None

    def clean(self):
        errors = {}

        if self.amount is not None and self.amount <= 0:
            errors["amount"] = "Credit note amount must be greater than 0."

        if self.invoice and self.amount:
            total_active_credit_notes = sum(
                note.amount
                for note in self.invoice.credit_notes.filter(is_active=True).exclude(pk=self.pk)
            )

            max_credit_available = self.invoice.total_amount - total_active_credit_notes

            if self.amount > max_credit_available:
                errors["amount"] = "Credit note amount cannot be greater than the available invoice balance."

        if errors:
            raise ValidationError(errors)

    def __str__(self):
        return f"Credit Note {self.credit_note_number} - Invoice {self.invoice.invoice_number}"
