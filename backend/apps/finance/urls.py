from rest_framework.routers import DefaultRouter

from apps.finance.views import (
    ExpenseViewSet,
    FinancialControlConfigViewSet,
    FinancialControlViewSet,
    OperationalAlertViewSet,
    FinancialStatementSnapshotViewSet,
)

router = DefaultRouter()
router.register(r"expenses", ExpenseViewSet, basename="expenses")
router.register(r"financial-control-configs", FinancialControlConfigViewSet, basename="financial-control-configs")
router.register(r"operational-alerts", OperationalAlertViewSet, basename="operational-alerts")
router.register(
    r"financial-statement-snapshots",
    FinancialStatementSnapshotViewSet,
    basename="financial-statement-snapshots",
)
router.register(r"financial-control", FinancialControlViewSet, basename="financial-control")

urlpatterns = router.urls
