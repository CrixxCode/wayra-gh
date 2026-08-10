import { Routes } from '@angular/router';
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
import { HotelSettings } from './components/pages/hotel-settings/hotel-settings';
import { MasterDataComponent } from './components/pages/master-data/master-data';
import { ForbiddenPage } from './components/pages/forbidden/forbidden';
import { NotFoundPage } from './components/pages/not-found/not-found';
import { authChildGuard } from './guards/auth.guard';
import { permissionChildGuard } from './guards/permission.guard';

const loadClientsComponent = () => import('./modules/clients/list-clients/list-clients').then((m) => m.ListClients);
const loadReservationsComponent = () =>
  import('./modules/reservations/list-reservations/list-reservations').then((m) => m.ListReservations);
const loadRoomsComponent = () => import('./modules/rooms/list-rooms/list-rooms').then((m) => m.ListRooms);
const loadServicesComponent = () =>
  import('./modules/services/list-services/list-services').then((m) => m.ListServices);
const loadBillingComponent = () => import('./modules/billing/list-bill/list-bill').then((m) => m.ListBill);
const loadPaymentsComponent = () =>
  import('./modules/payments/list-payments/list-payments').then((m) => m.ListPayments);
const loadPaymentRefundsComponent = () =>
  import('./modules/payments/list-payment-refunds/list-payment-refunds').then((m) => m.ListPaymentRefunds);
const loadIncomeConsolidatedComponent = () =>
  import('./modules/income-consolidated/list-income-consolidated/list-income-consolidated').then(
    (m) => m.ListIncomeConsolidated
  );
const loadFinancialControlComponent = () =>
  import('./modules/financial-control/list-financial-control/list-financial-control').then(
    (m) => m.ListFinancialControl
  );
const loadExpensesComponent = () =>
  import('./modules/expenses/list-expenses/list-expenses').then((m) => m.ListExpenses);
const loadPackagesComponent = () =>
  import('./modules/packages/list-packages/list-packages').then((m) => m.ListPackages);
const loadPromotionsComponent = () =>
  import('./modules/promotions/list-promotions/list-promotions').then((m) => m.ListPromotions);
const loadItemsComponent = () => import('./modules/items/list-items/list-items').then((m) => m.ListItems);
const loadRoomInventoryComponent = () =>
  import('./modules/room-inventory/list-room-inventory/list-room-inventory').then((m) => m.ListRoomInventory);
const loadInventoryMovementsComponent = () =>
  import('./modules/inventory-movements/list-inventory-movements/list-inventory-movements').then(
    (m) => m.ListInventoryMovements
  );
const loadCleaningTasksComponent = () =>
  import('./modules/cleaning-tasks/list-cleaning-tasks/list-cleaning-tasks').then((m) => m.ListCleaningTasks);
const loadMaintenanceOrdersComponent = () =>
  import('./modules/maintenance-orders/list-maintenance-orders/list-maintenance-orders').then(
    (m) => m.ListMaintenanceOrders
  );
const loadReportsComponent = () =>
  import('./modules/reports/list-reports/list-reports').then((m) => m.ListReports);
const loadActivityLogComponent = () =>
  import('./modules/reports/activity-log/activity-log').then((m) => m.ActivityLogPage);
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

export const routes: Routes = [
    {
        path: '',
        component: LandingPage,
        title: 'Gestion Hotelera',
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
            { path: 'usuarios', component: UserList, title: 'Usuarios' },
            { path: 'dashboard', component: Dashboard, title: 'Dashboard' },
            { path: 'roles', component: RolesComponent, title: 'Roles' },
            { path: 'recursos', component: RecursosComponent, title: 'Recursos' },
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
            { path: 'catalogo-servicios', loadComponent: loadServicesComponent },
            { path: 'servicios', redirectTo: 'catalogo-servicios', pathMatch: 'full' },
            { path: 'services', redirectTo: 'catalogo-servicios', pathMatch: 'full' },
            { path: 'facturas', loadComponent: loadBillingComponent },
            { path: 'facturacion', redirectTo: 'facturas', pathMatch: 'full' },
            { path: 'billing', redirectTo: 'facturas', pathMatch: 'full' },
            { path: 'pagos', loadComponent: loadPaymentsComponent },
            { path: 'payments', redirectTo: 'pagos', pathMatch: 'full' },
            { path: 'reembolsos', loadComponent: loadPaymentRefundsComponent, data: { breadcrumbLabel: 'Reembolsos' } },
            { path: 'payment-refunds', redirectTo: 'reembolsos', pathMatch: 'full' },
            { path: 'refunds', redirectTo: 'reembolsos', pathMatch: 'full' },
            { path: 'consolidado-ingresos', loadComponent: loadIncomeConsolidatedComponent },
            { path: 'control-financiero', loadComponent: loadFinancialControlComponent },
            { path: 'financial-control', redirectTo: 'control-financiero', pathMatch: 'full' },
            { path: 'ingresos', redirectTo: 'consolidado-ingresos', pathMatch: 'full' },
            { path: 'income-consolidated', redirectTo: 'consolidado-ingresos', pathMatch: 'full' },
            { path: 'egresos', loadComponent: loadExpensesComponent },
            { path: 'expenses', redirectTo: 'egresos', pathMatch: 'full' },
            { path: 'catalogo-paquetes', loadComponent: loadPackagesComponent },
            { path: 'paquetes', redirectTo: 'catalogo-paquetes', pathMatch: 'full' },
            { path: 'packages', redirectTo: 'catalogo-paquetes', pathMatch: 'full' },
            { path: 'promociones', loadComponent: loadPromotionsComponent },
            { path: 'promotions', redirectTo: 'promociones', pathMatch: 'full' },
            { path: 'items', loadComponent: loadItemsComponent },
            { path: 'inventario-items', redirectTo: 'items', pathMatch: 'full' },
            { path: 'inventory-items', redirectTo: 'items', pathMatch: 'full' },
            { path: 'inventario-habitaciones', loadComponent: loadRoomInventoryComponent },
            { path: 'room-inventory', redirectTo: 'inventario-habitaciones', pathMatch: 'full' },
            { path: 'movimientos-inventario', loadComponent: loadInventoryMovementsComponent },
            { path: 'inventory-movements', redirectTo: 'movimientos-inventario', pathMatch: 'full' },
            { path: 'tareas-limpieza', loadComponent: loadCleaningTasksComponent },
            { path: 'cleaning-tasks', redirectTo: 'tareas-limpieza', pathMatch: 'full' },
            { path: 'ordenes-mantenimiento', loadComponent: loadMaintenanceOrdersComponent },
            { path: 'maintenance-orders', redirectTo: 'ordenes-mantenimiento', pathMatch: 'full' },
            { path: 'reportes', loadComponent: loadReportsComponent },
            { path: 'actividad', loadComponent: loadActivityLogComponent },
            { path: 'activity-log', redirectTo: 'actividad', pathMatch: 'full' },
            { path: 'reports', redirectTo: 'reportes', pathMatch: 'full' },
            { path: 'mi-perfil', loadComponent: loadMyProfileComponent, title: 'Mi Perfil', data: { breadcrumbLabel: 'Mi Perfil' } },
            { path: 'hotel-config', component: HotelSettings, title: 'Configuracion Hotel' },
            { path: 'saas-panel', loadComponent: loadSaasDashboardComponent, title: 'Panel SaaS', data: { breadcrumbLabel: 'Panel SaaS', platformAdminOnly: true } },
            { path: 'saas-hoteles', loadComponent: loadSaasHotelsComponent, title: 'Hoteles Globales SaaS', data: { breadcrumbLabel: 'Hoteles Globales SaaS', platformAdminOnly: true } },
            { path: 'saas-hotels', redirectTo: 'saas-hoteles', pathMatch: 'full' },
            { path: 'saas-solicitudes-demo', loadComponent: loadDemoRequestsComponent, title: 'Solicitudes de Demo', data: { breadcrumbLabel: 'Solicitudes de Demo', platformAdminOnly: true } },
            { path: 'saas-amenidades', loadComponent: loadGlobalAmenitiesComponent, title: 'Amenidades Globales', data: { breadcrumbLabel: 'Amenidades Globales', platformAdminOnly: true } },
            { path: 'master-data', component: MasterDataComponent, title: 'Master Data' },
            { path: '403', component: ForbiddenPage, title: 'Acceso Denegado', data: { breadcrumbLabel: 'Acceso denegado' } },
            { path: '404', component: NotFoundPage, title: 'Pagina No Encontrada', data: { breadcrumbLabel: 'Pagina no encontrada' } },
            { path: '**', component: NotFoundPage, title: 'Pagina No Encontrada', data: { breadcrumbLabel: 'Pagina no encontrada' } },
        ]
    },
];
