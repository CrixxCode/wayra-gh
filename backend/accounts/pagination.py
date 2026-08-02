from rest_framework.pagination import PageNumberPagination


class OptionalPageNumberPagination(PageNumberPagination):
    """
    Backward-compatible pagination:
    - No `page`/`page_size` query params: keep legacy list response (plain array).
    - With `page` or `page_size`: return paginated response.
    """

    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 200

    def paginate_queryset(self, queryset, request, view=None):
        if "page" not in request.query_params and "page_size" not in request.query_params:
            return None
        return super().paginate_queryset(queryset, request, view=view)
