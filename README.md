# API Documentation for Academic Institutions and Programs Endpoints

## Overview

This document provides details on the `/excel-institutions` and `/academic-programs` endpoints of the API, which allow users to retrieve institutions and academic programs from their respective DynamoDB tables. Both endpoints support filtering and pagination.

## Endpoints

### 1. Institutions Endpoint

- **URL**: `/excel-institutions`
- **Method**: `GET`
- **Description**: Retrieves institutions from the `Instituciones` table.

#### Query Parameters

You can use the following query parameters to filter and paginate the results:

| Parameter      | Type   | Description                                                                 |
|----------------|--------|-----------------------------------------------------------------------------|
| `ciudad`       | String | Filter institutions by city (e.g., "Medellín").                           |
| `tipoInstitucion` | String | Filter institutions by type (e.g., "universidad", "instituto").         |
| `limit`        | Number | Number of results to return per page (default: 50).                       |
| `nextToken`    | String | Token for pagination (obtained from previous response).                    |

#### Example Requests

- Retrieve all institutions:
  ```
  GET /excel-institutions
  ```

- Filter by city:
  ```
  GET /excel-institutions?ciudad=Medellín
  ```

- Filter by institution type:
  ```
  GET /excel-institutions?tipoInstitucion=universidad
  ```

- With pagination:
  ```
  GET /excel-institutions?limit=20
  GET /excel-institutions?nextToken=[token]&limit=20
  ```

#### Example Response (200 OK)
```json
{
  "institutions": [
    {
      "id": "inst_12345678",
      "nombre": "Universidad de Medellín",
      "ciudad": "Medellín",
      "tipoInstitucion": "universidad",
      "codigoInstitucion": "12345"
    },
    // ... more institutions
  ],
  "count": 15,
  "nextToken": "encoded-pagination-token",
  "filters": {
    "ciudad": "Medellín",
    "tipoInstitucion": null
  }
}
```

### 2. Academic Programs Endpoint

- **URL**: `/academic-programs`
- **Method**: `GET`
- **Description**: Retrieves academic programs from the `ProgramasAcademicos` table.

#### Query Parameters

You can use the following query parameters to filter and paginate the results:

| Parameter      | Type   | Description                                                                 |
|----------------|--------|-----------------------------------------------------------------------------|
| `nivel`        | String | Filter programs by academic level (e.g., "pregrado", "maestría").         |
| `modalidad`    | String | Filter programs by modality (e.g., "Presencial", "Virtual").               |
| `institucionId`| String | Filter programs by institution ID (connects to the `id` field in Instituciones). |
| `municipio`    | String | Filter programs by municipality (e.g., "Medellín").                       |
| `limit`        | Number | Number of results to return per page (default: 50).                       |
| `nextToken`    | String | Token for pagination (obtained from previous response).                    |

#### Example Requests

- Retrieve all academic programs:
  ```
  GET /academic-programs
  ```

- Filter by academic level:
  ```
  GET /academic-programs?nivel=pregrado
  ```

- Filter by modality:
  ```
  GET /academic-programs?modalidad=Virtual
  ```

- Filter by institution:
  ```
  GET /academic-programs?institucionId=inst_12345678
  ```

- Filter by municipality:
  ```
  GET /academic-programs?municipio=Medellín
  ```

- Multiple filters:
  ```
  GET /academic-programs?nivel=pregrado&municipio=Medellín
  ```

- With pagination:
  ```
  GET /academic-programs?limit=20
  GET /academic-programs?nextToken=[token]&limit=20
  ```

#### Example Response (200 OK)
```json
{
  "programs": [
    {
      "id": "prog_12345678",
      "nombre": "Ingeniería de Sistemas",
      "institucionId": "inst_87654321",
      "nivel": "pregrado",
      "modalidad": "Presencial",
      "duracion": 10,
      "creditos": 170,
      "codigo": "12345",
      "estado": "Activo",
      "municipio": "Medellín"
    },
    // ... more programs
  ],
  "count": 15,
  "nextToken": "encoded-pagination-token",
  "filters": {
    "nivel": "pregrado",
    "modalidad": null,
    "institucionId": null,
    "municipio": "Medellín"
  }
}
```

## Notes

- Ensure that the API Gateway is properly configured to handle CORS if you are calling these endpoints from a web application.
- The `nextToken` parameter is used for pagination. If the response includes a `nextToken`, you can use it in subsequent requests to retrieve the next set of results.

## Conclusion

These endpoints provide a flexible way to access institutions and academic programs stored in their respective DynamoDB tables, allowing for efficient data retrieval based on various criteria. Use the provided examples to integrate this functionality into your application.