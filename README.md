# Sistema de Ventas - Tienda

Sistema completo para gestionar tu tienda con control de inventario, clientes, ventas y cuentas por cobrar (fiados) usando Supabase como base de datos.

## Características

- 📦 **Gestión de Productos**: Control de inventario con cálculo automático de costos unitarios y ganancias
- 👥 **Gestión de Clientes**: Registro de clientes con información de contacto
- 🛒 **Registro de Ventas**: Sistema de ventas con carrito de compras y control de stock
- 💰 **Cuentas por Cobrar**: Control de fiados con capacidad de marcar como pagados
- 📊 **Indicadores**: Cálculo automático de ganancias, stock bajo, y totales por cobrar

## Configuración

La aplicación guarda los datos en una base local persistente del equipo. No es obligatorio configurar Supabase: al abrir **Diagnóstico**, puedes usar el perfil local o crear perfiles locales independientes para distintas tiendas. Los perfiles se guardan en ese equipo y no se comparten entre instalaciones.

Para sincronizar un perfil local con una tienda en Supabase, selecciónalo en **Diagnóstico**, elige **Local con sincronización Supabase** e ingresa la URL y la clave pública (publishable/anon) de esa tienda. La aplicación conserva una copia local, acepta cambios sin conexión y los envía al recuperar internet. También puedes crear un perfil distinto para cada proyecto Supabase.

En bases de datos existentes, ejecuta una vez `supabase/migrations/202610010001_add_offline_sync_keys.sql` en el SQL Editor de cada proyecto conectado. Las instalaciones nuevas ya incluyen esas claves en `supabase/schema.sql`.

La cola de sincronización envía altas, cambios y eliminaciones en orden. Cuando la misma fila se modifica en más de un equipo antes de sincronizar, prevalece la última actualización que recibe Supabase. Configura en cada proyecto las políticas RLS apropiadas para permitir las operaciones de la aplicación.

### Telegram

La app invoca la función `supabase/functions/telegram-bot`; el token del bot solo debe estar configurado como secreto de Edge Functions, nunca con prefijo `VITE_`.

1. Ejecuta la migración `supabase/migrations/202609290001_add_telegram_chat_id.sql` en el SQL Editor de Supabase (si las tablas ya existen). En una instalación nueva, `supabase/schema.sql` ya incluye la columna.
2. Configura `TELEGRAM_BOT_TOKEN` como secreto del proyecto Supabase con el token de BotFather. Por ejemplo: `supabase secrets set TELEGRAM_BOT_TOKEN=...`.
3. Despliega la función: `supabase functions deploy telegram-bot`.
4. En el `.env` local conserva `VITE_TELEGRAM_BOT_USERNAME` para crear enlaces `t.me`; no agregues el token como variable `VITE_`.

Los clientes deben abrir su enlace y pulsar **Iniciar** antes de que el bot pueda enviarles mensajes. El botón de sincronización lee esos `/start` y guarda los `telegram_chat_id`.

### 1. Configurar Supabase (opcional)

1. Ve a [Supabase](https://supabase.com) y crea un proyecto nuevo
2. Ve al SQL Editor y ejecuta el script en `supabase/schema.sql` para crear las tablas
3. Copia tu URL y API Key desde Settings > API
4. Puedes agregar las credenciales al archivo `.env` para que el perfil inicial use ese proyecto, o configurarlas desde **Diagnóstico** dentro de la aplicación:

```env
VITE_SUPABASE_URL=tu_url_de_supabase
VITE_SUPABASE_PUBLISHABLE_KEY=tu_api_key_publica
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Ejecutar el proyecto

```bash
npm run dev
```

## Estructura de la Base de Datos

### Tablas

1. **productos**: Inventario y precios
   - `id_producto`: Identificador único
   - `nombre`: Nombre del producto
   - `unidades_por_paquete`: Para cálculo de costo unitario
   - `costo_paquete`: Precio de compra al mayor
   - `costo_unitario`: Calculado automáticamente (costo_paquete / unidades_por_paquete)
   - `precio_venta`: Precio de venta por unidad
   - `stock_actual`: Cantidad de unidades disponibles

2. **clientes**: Información de clientes
   - `id_cliente`: Identificador único
   - `nombre_cliente`: Nombre del cliente
   - `telefono`: Teléfono de contacto (opcional)

3. **ventas**: Encabezado de transacciones
   - `id_venta`: Identificador único
   - `fecha`: Fecha de la venta
   - `id_cliente`: Cliente que realizó la compra
   - `estado_pago`: 'Pagado' o 'Pendiente'
   - `monto_total`: Suma total de la venta (calculado automáticamente)

4. **detalle_venta**: Detalle de productos vendidos
   - `id_detalle`: Identificador único
   - `id_venta`: Venta asociada
   - `id_producto`: Producto vendido
   - `cantidad`: Cantidad de unidades
   - `precio_unitario`: Precio al momento de la venta
   - `subtotal`: Calculado automáticamente (cantidad * precio_unitario)

## Uso del Sistema

### 1. Configurar Productos
- Ve a la sección "Productos"
- Agrega tus productos con nombre, unidades por paquete, costo y precio de venta
- El sistema calcula automáticamente el costo unitario y la ganancia
- El stock se actualiza automáticamente cuando se realizan ventas

### 2. Registrar Clientes
- Ve a la sección "Clientes"
- Agrega los clientes que comprarán a crédito
- Puedes agregar su teléfono para contacto

### 3. Registrar Ventas
- Ve a la sección "Ventas"
- Selecciona el cliente
- Agrega productos al carrito
- Elige el estado de pago: "Pagado" o "Pendiente" (fiado)
- Completa la venta

### 4. Gestionar Cuentas por Cobrar
- Ve a la sección "Cuentas por Cobrar"
- Verás todas las ventas pendientes de pago
- Marca como pagadas cuando el cliente cancele su deuda

## Funcionalidades Automáticas

- **Cálculo de costos unitarios**: Se calcula automáticamente como `costo_paquete / unidades_por_paquete`
- **Cálculo de ganancias**: `precio_venta - costo_unitario`
- **Actualización de stock**: Se reduce automáticamente cuando se realizan ventas
- **Cálculo de totales**: El monto total de ventas se calcula sumando los detalles
- **Alertas de stock bajo**: Los productos con 10 o menos unidades se muestran en rojo

## Tecnologías

- **React 19**: Framework frontend
- **TypeScript**: Tipado estático
- **IndexedDB**: Base local persistente por perfil
- **Supabase**: Sincronización remota opcional
- **Vite**: Herramienta de build
- **Tailwind CSS**: Estilos (clases de utilidad)

## Scripts Disponibles

```bash
npm run dev      # Inicia el servidor de desarrollo
npm run build    # Compila para producción
npm run preview  # Previsualiza la versión de producción
npm run lint     # Ejecuta el linter
```

## Estructura del Proyecto

```
src/
├── components/           # Componentes React
│   ├── Navigation.tsx    # Barra de navegación
│   ├── ProductosManager.tsx  # Gestión de productos
│   ├── ClientesManager.tsx   # Gestión de clientes
│   ├── VentasManager.tsx     # Registro de ventas
│   └── CuentasPorCobrar.tsx  # Control de fiados
├── services/            # Servicios de API
│   ├── productosService.ts
│   ├── clientesService.ts
│   └── ventasService.ts
├── types/              # Tipos TypeScript
│   └── database.ts
├── lib/               # Persistencia y sincronización
│   ├── databaseProfiles.ts # Perfiles locales y clientes Supabase por tienda
│   ├── localDatabase.ts    # Bases IndexedDB separadas por perfil
│   └── dataAccess.ts       # Copia local y cola de sincronización
├── App.tsx           # Componente principal
└── App.css           # Estilos globales
```

## Notas Importantes

- Asegúrate de ejecutar el script SQL en Supabase antes de usar la aplicación
- Las credenciales de Supabase deben estar en el archivo `.env`
- El sistema usa triggers de PostgreSQL para cálculos automáticos
- El stock se actualiza automáticamente cuando se realizan ventas

## Soporte

Para problemas o preguntas, verifica:
1. Que las credenciales de Supabase sean correctas
2. Que el script SQL se haya ejecutado correctamente
3. Que las políticas RLS (Row Level Security) de Supabase permitan las operaciones necesarias
# Tienda_Oficina
