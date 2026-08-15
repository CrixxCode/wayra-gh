import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { Dashboard } from './components/pages/dashboard/dashboard';
import { LoginComponent } from './components/auth/login/login';
import { ForgotPasswordComponent } from './components/auth/forgot-password/forgot-password';
import { ResetPasswordComponent } from './components/auth/reset-password/reset-password';
import { LandingPage } from './components/pages/landing/landing';
import { LayoutMain } from './components/layout/layout-main/layout-main';
import { UserList } from './modules/users/list/user-list';
import { UserRegister } from './modules/users/register/register';
import { RolesComponent } from './components/pages/roles/roles';
import { RecursosComponent } from './components/pages/recursos/recursos';
import { MasterDataComponent } from './components/pages/master-data/master-data';
import { ForbiddenPage } from './components/pages/forbidden/forbidden';
import { NotFoundPage } from './components/pages/not-found/not-found';
import { authChildGuard } from './guards/auth.guard';
import { permissionChildGuard } from './guards/permission.guard';

const loadClientsComponent = () => import('./modules/clients/list-clients/list-clients').then((m) => m.ListClients);
const loadReservationsComponent = () =>
  import('./modules/reservations/list-reservations/list-reservations').then((m) => m.ListReservations);
const loadRoomsComponent = () => import('./modules/rooms/list-rooms/list-rooms').then((m) => m.ListRooms);
const loadCatalogComponent = () =>
  import('./modules/catalog/catalog-page/catalog-page').then((m) => m.CatalogPage);
const loadBillingComponent = () =>
  import('./modules/billing/billing-page/billing-page').then((m) => m.BillingPage);
const loadFinanceComponent = () =>
  import('./modules/finance/finance-page/finance-page').then((m) => m.FinancePage);
const loadFinancialControlComponent = () =>
  import('./modules/financial-control/list-financial-control/list-financial-control').then(
    (m) => m.ListFinancialControl
  );
const loadInventoryComponent = () =>
  import('./modules/inventory/inventory-page/inventory-page').then((m) => m.InventoryPage);
const loadOperationsComponent = () =>
  import('./modules/operations/operations-page/operations-page').then((m) => m.OperationsPage);
const loadReportsComponent = () =>
  import('./modules/reports/list-reports/list-reports').then((m) => m.ListReports);
// Perezosa como el resto: es una pantalla grande, con el mapa y su CSS, y hasta ahora
// viajaba entera en el paquete inicial de toda la aplicacion.
const loadHotelSettingsComponent = () =>
  import('./components/pages/hotel-settings/hotel-settings').then((m) => m.HotelSettings);
const loadAuditComponent = () =>
  import('./modules/audit/audit-log/audit-log').then((m) => m.AuditLogPage);
const loadMyProfileComponent = () =>
  import('./modules/users/my-profile/my-profile').then((m) => m.MyProfilePage);
const loadSaasDashboardComponent = () =>
  import('./modules/saas/list-saas-dashboard/list-saas-dashboard').then((m) => m.ListSaasDashboard);
const loadSaasHotelsComponent = () =>
  import('./modules/saas/list-saas-hotels/list-saas-hotels').then((m) => m.ListSaasHotels);
const loadDemoRequestsComponent = () =>
  import('./modules/saas/list-demo-requests/list-demo-requests').then((m) => m.ListDemoRequests);
const loadGlobalAmenitiesComponent = () =>
  import('./modules/saas/list-global-amenities/list-global-amenities').then((m) => m.ListGlobalAmenities);
const loadAlliedHotelsComponent = () =>
  import('./components/pages/allied-hotels/allied-hotels').then((m) => m.AlliedHotelsPage);
const loadAlliedBookingComponent = () =>
  import('./components/pages/allied-booking/allied-booking').then((m) => m.AlliedBookingPage);
const loadAlliedBookingRatesComponent = () =>
  import('./components/pages/allied-booking/allied-booking-rates').then(
    (m) => m.AlliedBookingRatesPage
  );
const loadAlliedBookingRequestComponent = () =>
  import('./components/pages/allied-booking/allied-booking-request').then(
    (m) => m.AlliedBookingRequestPage
  );
const loadAlliedBookingConfirmationComponent = () =>
  import('./components/pages/allied-booking/allied-booking-confirmation').then(
    (m) => m.AlliedBookingConfirmationPage
  );
const loadOnlineCheckInComponent = () =>
  import('./components/pages/online-check-in/online-check-in').then((m) => m.OnlineCheckInPage);


/**
 * Las tres pantallas del catalogo se unificaron en `/catalogo-comercial` con pestañas.
 * Se conservan los alias viejos (AGENTS.md 5.13) apuntando a su pestaña.
 *
 * Se usa la forma funcional de `redirectTo` porque la de texto trata el valor como una
 * ruta: un `?tab=...` terminaria dentro del segmento en vez de ser un query param.
 */
const redirectToCatalogTab = (tab: 'services' | 'packages' | 'promotions') => () =>
  inject(Router).parseUrl(`/catalogo-comercial?tab=${tab}`);

const redirectToBillingTab = (tab: 'invoices' | 'payments' | 'refunds') => () =>
  inject(Router).parseUrl(`/facturacion?tab=${tab}`);

const redirectToInventoryTab = (tab: 'items' | 'rooms' | 'movements') => () =>
  inject(Router).parseUrl(`/inventario?tab=${tab}`);

const redirectToOperationsTab = (tab: 'cleaning' | 'maintenance' | 'rooms') => () =>
  inject(Router).parseUrl(`/limpieza-mantenimiento?tab=${tab}`);

const redirectToFinanceTab = (tab: 'result' | 'income' | 'expenses') => () =>
  inject(Router).parseUrl(`/finanzas?tab=${tab}`);

export const routes: Routes = [
    {
        path: '',
        component: LandingPage,
        title: 'Gestion Hotelera',
    },
    {
        path: 'hoteles-aliados',
        loadComponent: loadAlliedHotelsComponent,
        title: 'Hoteles Aliados',
    },
    {
        path: 'reservar',
        loadComponent: loadAlliedBookingComponent,
        title: 'Reservar Hotel Aliado',
    },
    {
        path: 'reservar/tarifas/:hotelSlug',
        loadComponent: loadAlliedBookingRatesComponent,
        title: 'Elegir Tarifa',
    },
    {
        path: 'reservar/solicitud/:hotelSlug/:rateId',
        loadComponent: loadAlliedBookingRequestComponent,
        title: 'Solicitud de Reserva',
    },
    {
        path: 'reservar/confirmacion/:reservationId',
        loadComponent: loadAlliedBookingConfirmationComponent,
        title: 'Reserva Registrada',
    },
    {
        path: 'booking',
        redirectTo: 'reservar',
        pathMatch: 'full',
    },
    {
        path: 'check-in-online',
        loadComponent: loadOnlineCheckInComponent,
        title: 'Check-in Online',
    },
    {
        path: 'online-check-in',
        redirectTo: 'check-in-online',
        pathMatch: 'full',
    },
    {
        path: 'checkin-online',
        redirectTo: 'check-in-online',
        pathMatch: 'full',
    },
    {
        path: 'login',
        component: LoginComponent,
        title: 'Login',
    },
    {
        path: 'forgot-password',
        component: ForgotPasswordComponent,
        title: 'Recuperar Contrasena',
    },
    {
        path: 'reset-password',
        component: ResetPasswordComponent,
        title: 'Restablecer Contrasena',
    },
    {
        path: '',
        component: LayoutMain,
        canActivateChild: [authChildGuard, permissionChildGuard],
        children: [
            { path: 'usuarios', component: UserList, title: 'Usuarios', data: { platformAdminOnly: true } },
            { path: 'dashboard', component: Dashboard, title: 'Dashboard' },
            { path: 'roles', component: RolesComponent, title: 'Roles', data: { platformAdminOnly: true } },
            { path: 'recursos', component: RecursosComponent, title: 'Recursos', data: { platformAdminOnly: true } },
            { path: 'clientes', loadComponent: loadClientsComponent },
            { path: 'reservas', loadComponent: loadReservationsComponent },
            { path: 'habitaciones', loadComponent: loadRoomsComponent },
            // Tipos, tarifas y amenidades se gestionan dentro de /habitaciones (modales).
            // Se mantienen los redirects para no romper enlaces guardados ni recursos RBAC antiguos.
            { path: 'tipos-habitacion', redirectTo: 'habitaciones', pathMatch: 'full' },
            { path: 'room-types', redirectTo: 'habitaciones', pathMatch: 'full' },
            { path: 'tarifas-habitacion', redirectTo: 'habitaciones', pathMatch: 'full' },
            { path: 'tarifas', redirectTo: 'habitaciones', pathMatch: 'full' },
            { path: 'rates', redirectTo: 'habitaciones', pathMatch: 'full' },
            { path: 'amenidades', redirectTo: 'habitaciones', pathMatch: 'full' },
            { path: 'amenities', redirectTo: 'habitaciones', pathMatch: 'full' },
            { path: 'catalogo-comercial', loadComponent: loadCatalogComponent, title: 'Catalogo comercial' },
            { path: 'catalogo-servicios', redirectTo: redirectToCatalogTab('services'), pathMatch: 'full' },
            { path: 'servicios', redirectTo: redirectToCatalogTab('services'), pathMatch: 'full' },
            { path: 'services', redirectTo: redirectToCatalogTab('services'), pathMatch: 'full' },
            { path: 'facturacion', loadComponent: loadBillingComponent, title: 'Facturas y pagos' },
            { path: 'facturas', redirectTo: redirectToBillingTab('invoices'), pathMatch: 'full' },
            { path: 'billing', redirectTo: redirectToBillingTab('invoices'), pathMatch: 'full' },
            { path: 'invoices', redirectTo: redirectToBillingTab('invoices'), pathMatch: 'full' },
            { path: 'pagos', redirectTo: redirectToBillingTab('payments'), pathMatch: 'full' },
            { path: 'payments', redirectTo: redirectToBillingTab('payments'), pathMatch: 'full' },
            { path: 'reembolsos', redirectTo: redirectToBillingTab('refunds'), pathMatch: 'full' },
            { path: 'payment-refunds', redirectTo: redirectToBillingTab('refunds'), pathMatch: 'full' },
            { path: 'refunds', redirectTo: redirectToBillingTab('refunds'), pathMatch: 'full' },
            { path: 'finanzas', loadComponent: loadFinanceComponent, title: 'Finanzas' },
            { path: 'consolidado-ingresos', redirectTo: redirectToFinanceTab('income'), pathMatch: 'full' },
            { path: 'ingresos', redirectTo: redirectToFinanceTab('income'), pathMatch: 'full' },
            { path: 'income-consolidated', redirectTo: redirectToFinanceTab('income'), pathMatch: 'full' },
            { path: 'egresos', redirectTo: redirectToFinanceTab('expenses'), pathMatch: 'full' },
            { path: 'expenses', redirectTo: redirectToFinanceTab('expenses'), pathMatch: 'full' },
            { path: 'control-financiero', loadComponent: loadFinancialControlComponent },
            { path: 'financial-control', redirectTo: 'control-financiero', pathMatch: 'full' },
            { path: 'catalogo-paquetes', redirectTo: redirectToCatalogTab('packages'), pathMatch: 'full' },
            { path: 'paquetes', redirectTo: redirectToCatalogTab('packages'), pathMatch: 'full' },
            { path: 'packages', redirectTo: redirectToCatalogTab('packages'), pathMatch: 'full' },
            { path: 'promociones', redirectTo: redirectToCatalogTab('promotions'), pathMatch: 'full' },
            { path: 'promotions', redirectTo: redirectToCatalogTab('promotions'), pathMatch: 'full' },
            { path: 'inventario', loadComponent: loadInventoryComponent, title: 'Inventario' },
            { path: 'items', redirectTo: redirectToInventoryTab('items'), pathMatch: 'full' },
            { path: 'inventario-items', redirectTo: redirectToInventoryTab('items'), pathMatch: 'full' },
            { path: 'inventory-items', redirectTo: redirectToInventoryTab('items'), pathMatch: 'full' },
            { path: 'inventario-habitaciones', redirectTo: redirectToInventoryTab('rooms'), pathMatch: 'full' },
            { path: 'room-inventory', redirectTo: redirectToInventoryTab('rooms'), pathMatch: 'full' },
            { path: 'movimientos-inventario', redirectTo: redirectToInventoryTab('movements'), pathMatch: 'full' },
            { path: 'inventory-movements', redirectTo: redirectToInventoryTab('movements'), pathMatch: 'full' },
            {
              path: 'limpieza-mantenimiento',
              loadComponent: loadOperationsComponent,
              title: 'Limpieza y mantenimiento'
            },
            { path: 'tareas-limpieza', redirectTo: redirectToOperationsTab('cleaning'), pathMatch: 'full' },
            { path: 'cleaning-tasks', redirectTo: redirectToOperationsTab('cleaning'), pathMatch: 'full' },
            { path: 'ordenes-mantenimiento', redirectTo: redirectToOperationsTab('maintenance'), pathMatch: 'full' },
            { path: 'maintenance-orders', redirectTo: redirectToOperationsTab('maintenance'), pathMatch: 'full' },
            { path: 'reportes', loadComponent: loadReportsComponent },
            { path: 'auditoria', loadComponent: loadAuditComponent, title: 'Auditoria' },
            // Los enlaces viejos siguen funcionando: la pantalla cambio de nombre, no de sitio.
            { path: 'actividad', redirectTo: 'auditoria', pathMatch: 'full' },
            { path: 'activity-log', redirectTo: 'auditoria', pathMatch: 'full' },
            { path: 'reports', redirectTo: 'reportes', pathMatch: 'full' },
            { path: 'mi-perfil', loadComponent: loadMyProfileComponent, title: 'Mi Perfil', data: { breadcrumbLabel: 'Mi Perfil' } },
            { path: 'hotel-config', loadComponent: loadHotelSettingsComponent, title: 'Configuracion Hotel' },
            { path: 'saas-panel', loadComponent: loadSaasDashboardComponent, title: 'Panel SaaS', data: { breadcrumbLabel: 'Panel SaaS', platformAdminOnly: true } },
            { path: 'saas-hoteles', loadComponent: loadSaasHotelsComponent, title: 'Hoteles Globales SaaS', data: { breadcrumbLabel: 'Hoteles Globales SaaS', platformAdminOnly: true } },
            { path: 'saas-hotels', redirectTo: 'saas-hoteles', pathMatch: 'full' },
            { path: 'saas-solicitudes-demo', loadComponent: loadDemoRequestsComponent, title: 'Solicitudes de Demo', data: { breadcrumbLabel: 'Solicitudes de Demo', platformAdminOnly: true } },
            { path: 'saas-amenidades', loadComponent: loadGlobalAmenitiesComponent, title: 'Amenidades Globales', data: { breadcrumbLabel: 'Amenidades Globales', platformAdminOnly: true } },
            { path: 'master-data', component: MasterDataComponent, title: 'Master Data', data: { platformAdminOnly: true } },
            { path: '403', component: ForbiddenPage, title: 'Acceso Denegado', data: { breadcrumbLabel: 'Acceso denegado' } },
            { path: '404', component: NotFoundPage, title: 'Pagina No Encontrada', data: { breadcrumbLabel: 'Pagina no encontrada' } },
            { path: '**', component: NotFoundPage, title: 'Pagina No Encontrada', data: { breadcrumbLabel: 'Pagina no encontrada' } },
        ]
    },
];
