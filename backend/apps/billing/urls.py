from rest_framework.routers import DefaultRouter

from apps.billing.views import (
    ChargeViewSet,
    InvoiceViewSet,
    InvoiceChargeViewSet,
    PaymentViewSet,
    PaymentRefundViewSet,
    CreditNoteViewSet,
)

router = DefaultRouter()
router.register(r"charges", ChargeViewSet, basename="charges")
router.register(r"invoices", InvoiceViewSet, basename="invoices")
router.register(r"invoice-charges", InvoiceChargeViewSet, basename="invoice-charges")
router.register(r"payments", PaymentViewSet, basename="payments")
router.register(r"payment-refunds", PaymentRefundViewSet, basename="payment-refunds")
router.register(r"credit-notes", CreditNoteViewSet, basename="credit-notes")

urlpatterns = router.urls
