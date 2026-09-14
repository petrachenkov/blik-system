import { apiClient } from './client';
import type { Category, Location, SlaConfig, StaffDirectoryUser, TicketPriority, UserListItem, UserRole } from '../types';

export function fetchCategories(includeInactive = false) {
  return apiClient.get<Category[]>('/categories', { params: { includeInactive } }).then((r) => r.data);
}

export function createCategory(name: string) {
  return apiClient.post<Category>('/categories', { name }).then((r) => r.data);
}

export function updateCategory(id: string, data: Partial<Pick<Category, 'name' | 'isActive'>>) {
  return apiClient.patch<Category>(`/categories/${id}`, data).then((r) => r.data);
}

export function deleteCategory(id: string) {
  return apiClient.delete(`/categories/${id}`).then((r) => r.data);
}

export function fetchLocations(includeInactive = false) {
  return apiClient.get<Location[]>('/locations', { params: { includeInactive } }).then((r) => r.data);
}

export function createLocation(data: { building: string; room: string; label?: string }) {
  return apiClient.post<Location>('/locations', data).then((r) => r.data);
}

export function updateLocation(id: string, data: Partial<Omit<Location, 'id'>>) {
  return apiClient.patch<Location>(`/locations/${id}`, data).then((r) => r.data);
}

export function deleteLocation(id: string) {
  return apiClient.delete(`/locations/${id}`).then((r) => r.data);
}

export function fetchSlaConfigs() {
  return apiClient.get<SlaConfig[]>('/sla-configs').then((r) => r.data);
}

export function updateSlaConfig(priority: TicketPriority, data: { responseMinutes: number; resolutionMinutes: number }) {
  return apiClient.put<SlaConfig>(`/sla-configs/${priority}`, data).then((r) => r.data);
}

export function fetchUsers() {
  return apiClient.get<UserListItem[]>('/users').then((r) => r.data);
}

/** Урезанный список коллег для @упоминаний — доступен любому сотруднику (см. план). */
export function fetchStaffDirectory() {
  return apiClient.get<StaffDirectoryUser[]>('/users/staff-directory').then((r) => r.data);
}

export function setUserRole(id: string, role: UserRole) {
  return apiClient.patch<UserListItem>(`/users/${id}/role`, { role }).then((r) => r.data);
}

/** Создание локальной (не-AD) учётной записи — только сисадмин (см. план "Локальные учётки"). */
export function createLocalUser(data: { username: string; fullName: string; password: string; role: UserRole }) {
  return apiClient.post<UserListItem>('/users/local', data).then((r) => r.data);
}

/** Удаление учётки с обезличиванием следов — master и себя удалить нельзя. */
export function deleteUser(id: string) {
  return apiClient.delete(`/users/${id}`).then((r) => r.data);
}

/** Подтягивает всех членов группы сотрудников из AD (не дожидаясь их первого личного входа)
 * и деактивирует тех, кого из группы убрали (см. план "Обратная синхронизация"). */
export function syncUsersFromLdap() {
  return apiClient.post<{ synced: number; deactivated: number }>('/users/sync-ldap').then((r) => r.data);
}
