import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { serviceErrorMessage } from '@/api/endpoints/internal-service-v1';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  icons,
  Input,
  LoadingState,
  Screen,
  SearchInput,
  SectionHeader,
  Text,
} from '@/design-system';
import {
  CAP_SERVICE_DEVICES_MANAGE,
  CAP_SERVICE_ORDERS_CREATE,
  SERVICE_DEVICE_TYPES,
  type ServiceCustomerSummary,
  type ServiceDevice,
} from '@/domain/internal/service-types';
import { hasUxCapability } from '@/domain/internal/types';
import {
  useCreateServiceDevice,
  useReceiveDevice,
  useServiceContext,
  useServiceCustomerSearch,
  useServiceDevices,
} from '@/hooks/use-internal-service';
import { useInternalContext } from '@/hooks/use-internal-sales';
import { useTheme } from '@/theme/theme-provider';

/**
 * Receiving a device into the workshop.
 *
 * FOUR STEPS, in the order the counter actually works: who is standing there,
 * which device they brought, which shop is taking it, and what they say is
 * wrong.
 *
 * WHAT THIS FORM CANNOT SEND, and has no field for: the order number, the
 * status, the company, who received it or when. All five belong to the server,
 * and the only way to guarantee a client cannot set one is to have nowhere to
 * type it.
 *
 * THE CUSTOMER IS SEARCHED, NOT LISTED. "Download every client of this company"
 * is not a request an intake screen ever needs to make, and the endpoint is
 * built to refuse it politely — without a term it returns the most recent few.
 *
 * THE DEVICE IS CHOSEN FROM WHAT THE SERVER RETURNED, or registered here. There
 * is no free-text field for a device id: a typed id is an invitation to guess
 * at somebody else's property, and the server would answer 404 while the app
 * encouraged the attempt.
 */
export default function ServiceIntakeScreen() {
  const theme = useTheme();

  const { data: context, isPending: contextPending } = useInternalContext();
  const mayCreate = hasUxCapability(context ?? null, CAP_SERVICE_ORDERS_CREATE);
  const mayRegisterDevice = hasUxCapability(context ?? null, CAP_SERVICE_DEVICES_MANAGE);

  const service = useServiceContext({ enabled: mayCreate });
  const receive = useReceiveDevice();
  const createDevice = useCreateServiceDevice();

  const [search, setSearch] = useState('');
  const [customer, setCustomer] = useState<ServiceCustomerSummary | null>(null);
  const [device, setDevice] = useState<ServiceDevice | null>(null);
  const [branchId, setBranchId] = useState<number | null>(null);
  const [reportedIssue, setReportedIssue] = useState('');
  const [physicalCondition, setPhysicalCondition] = useState('');
  const [accessories, setAccessories] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // The new-device sub-form.
  const [registering, setRegistering] = useState(false);
  const [deviceType, setDeviceType] = useState<string>('phone');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [imei, setImei] = useState('');

  const customers = useServiceCustomerSearch(search.trim(), {
    enabled: mayCreate && customer === null,
  });
  const devices = useServiceDevices(
    { customerId: customer?.id },
    { enabled: mayCreate && customer !== null && device === null },
  );

  const title = 'Recibir un equipo';

  if (contextPending) {
    return (
      <>
        <Stack.Screen options={{ title }} />
        <Screen scrollable>
          <LoadingState label="Cargando" skeletonCount={3} />
        </Screen>
      </>
    );
  }

  if (!mayCreate) {
    return (
      <>
        <Stack.Screen options={{ title }} />
        <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
          <EmptyState
            icon={icons.info}
            title="No puedes recibir equipos"
            message="Tu cuenta puede ver el servicio técnico, pero no abrir órdenes."
            actionLabel="Volver"
            onAction={() => router.replace('/internal/service')}
          />
        </Screen>
      </>
    );
  }

  if (service.isError) {
    return (
      <>
        <Stack.Screen options={{ title }} />
        <Screen scrollable contentContainerStyle={{ flexGrow: 1 }}>
          <ErrorState error={service.error} onRetry={() => void service.refetch()} />
        </Screen>
      </>
    );
  }

  const branches = service.data?.availableBranches ?? [];
  const effectiveBranch = branchId ?? (branches.length === 1 ? branches[0]!.id : null);

  const issueError = submitted && reportedIssue.trim().length === 0
    ? 'Describe lo que el cliente reportó.'
    : undefined;
  const branchError = submitted && effectiveBranch === null
    ? 'Elige la sucursal que recibe el equipo.'
    : undefined;

  const submit = () => {
    setSubmitted(true);
    if (!customer || !device || effectiveBranch === null) return;
    if (reportedIssue.trim().length === 0) return;

    receive.mutate(
      {
        customerId: customer.id,
        deviceId: device.id,
        branchId: effectiveBranch,
        reportedIssue: reportedIssue.trim(),
        physicalCondition: physicalCondition.trim() || undefined,
        receivedAccessories: accessories.trim() || undefined,
        internalNotes: internalNotes.trim() || undefined,
      },
      {
        onSuccess: (created) => {
          const order = created as { id: number };
          router.replace(`/internal/service/orders/${order.id}`);
        },
      },
    );
  };

  const registerDevice = () => {
    if (!customer) return;
    createDevice.mutate(
      {
        customerId: customer.id,
        deviceType,
        brand: brand.trim(),
        model: model.trim(),
        serialNumber: serialNumber.trim() || undefined,
        imei: imei.trim() || undefined,
      },
      {
        onSuccess: (created) => {
          setDevice(created as ServiceDevice);
          setRegistering(false);
          setBrand('');
          setModel('');
          setSerialNumber('');
          setImei('');
        },
      },
    );
  };

  return (
    <>
      <Stack.Screen options={{ title }} />
      <Screen scrollable avoidKeyboard>
        <View style={{ gap: theme.spacing.lg }}>
          {/* ── 1. Who is at the counter ─────────────────────────────────── */}
          <View>
            <SectionHeader title="Cliente" />
            {customer ? (
              <Card variant="outlined">
                <View style={{ gap: 2 }}>
                  <Text variant="headline">{customer.displayName}</Text>
                  <Text variant="subhead" color="textSecondary">
                    {[customer.documentNumber, customer.phone].filter(Boolean).join(' · ') || '—'}
                  </Text>
                  <Button
                    label="Cambiar cliente"
                    variant="ghost"
                    size="compact"
                    onPress={() => {
                      setCustomer(null);
                      setDevice(null);
                    }}
                  />
                </View>
              </Card>
            ) : (
              <View style={{ gap: theme.spacing.sm }}>
                <SearchInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Buscar por nombre, documento o teléfono"
                />
                {customers.isError ? (
                  <ErrorState
                    error={customers.error}
                    onRetry={() => void customers.refetch()}
                  />
                ) : customers.isPending ? (
                  <LoadingState label="Buscando clientes" skeletonCount={3} />
                ) : customers.data.results.length === 0 ? (
                  <EmptyState
                    icon={icons.empty}
                    title="Sin resultados"
                    message="Ningún cliente de esta empresa coincide con esa búsqueda."
                  />
                ) : (
                  customers.data.results.map((row) => (
                    <Card key={row.id} variant="outlined" onPress={() => setCustomer(row)}>
                      <View style={{ gap: 2 }}>
                        <Text variant="headline">{row.displayName}</Text>
                        <Text variant="subhead" color="textSecondary">
                          {[row.documentNumber, row.phone].filter(Boolean).join(' · ') || '—'}
                        </Text>
                      </View>
                    </Card>
                  ))
                )}
              </View>
            )}
          </View>

          {/* ── 2. Which device ──────────────────────────────────────────── */}
          {customer ? (
            <View>
              <SectionHeader title="Equipo" />
              {device ? (
                <Card variant="outlined">
                  <View style={{ gap: 2 }}>
                    <Text variant="headline">{device.displayName}</Text>
                    <Text variant="subhead" color="textSecondary">
                      {device.deviceTypeLabel}
                      {device.serialNumber ? ` · ${device.serialNumber}` : ''}
                    </Text>
                    <Button
                      label="Cambiar equipo"
                      variant="ghost"
                      size="compact"
                      onPress={() => setDevice(null)}
                    />
                  </View>
                </Card>
              ) : registering ? (
                <Card variant="outlined">
                  <View style={{ gap: theme.spacing.sm }}>
                    <View style={{ gap: theme.spacing.xs }}>
                      <Text variant="footnote" color="textTertiary">
                        Tipo de equipo
                      </Text>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ gap: theme.spacing.xs }}
                      >
                        {SERVICE_DEVICE_TYPES.map((type) => (
                          <Button
                            key={type.value}
                            label={type.label}
                            size="compact"
                            variant={deviceType === type.value ? 'primary' : 'ghost'}
                            onPress={() => setDeviceType(type.value)}
                          />
                        ))}
                      </ScrollView>
                    </View>

                    <Input label="Marca" value={brand} onChangeText={setBrand} />
                    <Input label="Modelo" value={model} onChangeText={setModel} />
                    {/* OPTIONAL, both. A serial is transcribed by hand from a
                        sticker and many devices have none that can be read. */}
                    <Input
                      label="Número de serie (opcional)"
                      value={serialNumber}
                      onChangeText={setSerialNumber}
                      autoCapitalize="characters"
                    />
                    <Input
                      label="IMEI (opcional)"
                      value={imei}
                      onChangeText={setImei}
                      keyboardType="number-pad"
                    />

                    {createDevice.isError ? (
                      <Text variant="subhead" color="danger">
                        {serviceErrorMessage(createDevice.error)}
                      </Text>
                    ) : null}

                    <Button
                      label="Registrar equipo"
                      loading={createDevice.isPending}
                      onPress={registerDevice}
                    />
                    <Button
                      label="Cancelar"
                      variant="ghost"
                      onPress={() => setRegistering(false)}
                    />
                  </View>
                </Card>
              ) : (
                <View style={{ gap: theme.spacing.sm }}>
                  {devices.isError ? (
                    <ErrorState error={devices.error} onRetry={() => void devices.refetch()} />
                  ) : devices.isPending ? (
                    <LoadingState label="Cargando equipos" skeletonCount={2} />
                  ) : devices.data.results.length === 0 ? (
                    <EmptyState
                      icon={icons.empty}
                      title="Sin equipos registrados"
                      message="Este cliente todavía no tiene equipos en el sistema."
                    />
                  ) : (
                    devices.data.results.map((row) => (
                      <Card key={row.id} variant="outlined" onPress={() => setDevice(row)}>
                        <View style={{ gap: 2 }}>
                          <Text variant="headline">{row.displayName}</Text>
                          <Text variant="subhead" color="textSecondary">
                            {row.deviceTypeLabel}
                            {row.serialNumber ? ` · ${row.serialNumber}` : ''}
                          </Text>
                        </View>
                      </Card>
                    ))
                  )}

                  {mayRegisterDevice ? (
                    <Button
                      label="Registrar un equipo nuevo"
                      variant="secondary"
                      onPress={() => setRegistering(true)}
                    />
                  ) : null}
                </View>
              )}
            </View>
          ) : null}

          {/* ── 3. Which shop, and 4. what is wrong ──────────────────────── */}
          {customer && device ? (
            <>
              {branches.length > 1 ? (
                <View>
                  <SectionHeader title="Sucursal que recibe" />
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: theme.spacing.xs }}
                  >
                    {branches.map((branch) => (
                      <Button
                        key={branch.id}
                        label={branch.name}
                        size="compact"
                        variant={effectiveBranch === branch.id ? 'primary' : 'ghost'}
                        onPress={() => setBranchId(branch.id)}
                      />
                    ))}
                  </ScrollView>
                  {branchError ? (
                    <Text variant="footnote" color="danger">
                      {branchError}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              <View style={{ gap: theme.spacing.sm }}>
                <Input
                  label="Problema reportado"
                  value={reportedIssue}
                  onChangeText={setReportedIssue}
                  multiline
                  error={issueError}
                  hint="Con las palabras del cliente, no un diagnóstico."
                />
                <Input
                  label="Condición física (opcional)"
                  value={physicalCondition}
                  onChangeText={setPhysicalCondition}
                  multiline
                  hint="Rayones, golpes, piezas faltantes. Es la defensa de ambas partes."
                />
                <Input
                  label="Accesorios recibidos (opcional)"
                  value={accessories}
                  onChangeText={setAccessories}
                />
                <Input
                  label="Notas internas (opcional)"
                  value={internalNotes}
                  onChangeText={setInternalNotes}
                  multiline
                  hint="El cliente no las ve."
                />
              </View>

              {receive.isError ? (
                <Card variant="outlined">
                  <Text variant="subhead" color="danger">
                    {serviceErrorMessage(receive.error)}
                  </Text>
                </Card>
              ) : null}

              <Button
                label="Abrir la orden"
                fullWidth
                loading={receive.isPending}
                onPress={submit}
              />
            </>
          ) : null}

          <Button
            label="Cancelar"
            variant="ghost"
            fullWidth
            onPress={() => router.back()}
          />
        </View>
      </Screen>
    </>
  );
}
