import requests
import re
import os
import time
from bs4 import BeautifulSoup

class HECAAScraper:
    def __init__(self):
        # URLs
        self.base_url = "https://hecaa.mineducacion.gov.co/consultaspublicas/programas"
        
        # Headers comunes para todas las peticiones
        self.headers = {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
            "Accept-Language": "es-ES,es;q=0.9,fr;q=0.8,en;q=0.7",
            "Cache-Control": "max-age=0",
            "Connection": "keep-alive",
            "Content-Type": "application/x-www-form-urlencoded",
            "Origin": "https://hecaa.mineducacion.gov.co",
            "Referer": "https://hecaa.mineducacion.gov.co/consultaspublicas/programas",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "same-origin",
            "Sec-Fetch-User": "?1",
            "Upgrade-Insecure-Requests": "1",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
            "sec-ch-ua": "\"Chromium\";v=\"134\", \"Not:A-Brand\";v=\"24\", \"Google Chrome\";v=\"134\"",
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": "\"Windows\""
        }
        
        # ViewState - se extraerá de la página inicial
        self.view_state = None
        
        # Sesión para mantener cookies
        self.session = requests.Session()
    
    def iniciar_sesion(self):
        """Realiza la primera petición para obtener cookies y ViewState"""
        print("Iniciando sesión y obteniendo cookies...")
        
        try:
            # Petición GET inicial
            response = self.session.get(self.base_url, headers={
                "User-Agent": self.headers["User-Agent"],
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
            })
            
            # Verificar respuesta
            if response.status_code != 200:
                print(f"Error al cargar página inicial: Código {response.status_code}")
                with open("error_response.html", "w", encoding="utf-8") as f:
                    f.write(response.text)
                print("Respuesta guardada en 'error_response.html'")
                return False
            
            # Guardar respuesta para análisis (opcional)
            with open("pagina_inicial.html", "w", encoding="utf-8") as f:
                f.write(response.text)
            
            # Extraer ViewState
            soup = BeautifulSoup(response.text, 'html.parser')
            view_state_element = soup.find('input', {'name': 'javax.faces.ViewState'})
            
            if view_state_element and 'value' in view_state_element.attrs:
                self.view_state = view_state_element['value']
                print(f"ViewState obtenido: {self.view_state[:20]}...")
            else:
                print("No se pudo encontrar ViewState en la página inicial")
                
                # Intentar extraer ViewState con regex como alternativa
                view_state_pattern = r'name="javax\.faces\.ViewState" value="([^"]+)"'
                match = re.search(view_state_pattern, response.text)
                if match:
                    self.view_state = match.group(1)
                    print(f"ViewState obtenido con regex: {self.view_state[:20]}...")
                else:
                    return False
            
            # Las cookies ya estarán en la sesión
            print("Sesión iniciada correctamente")
            return True
            
        except Exception as e:
            print(f"Error al iniciar sesión: {e}")
            return False
    
    def buscar_programas_antioquia_medellin(self):
        """Realiza búsqueda de programas filtrando por Antioquia y Medellín"""
        print("Realizando búsqueda de programas en Medellín, Antioquia...")
        
        try:
            # Primero seleccionamos Antioquia como departamento
            data_departamento = {
                "javax.faces.partial.ajax": "true",
                "javax.faces.source": "formFiltro:departamentos",
                "javax.faces.partial.execute": "formFiltro:departamentos",
                "javax.faces.partial.render": "formFiltro:municipios",
                "javax.faces.behavior.event": "valueChange",
                "javax.faces.partial.event": "change",
                "formFiltro": "formFiltro",
                "formFiltro:departamentos_input": "ANTIOQUIA",
                "javax.faces.ViewState": self.view_state
            }
            
            # Hacer la petición para seleccionar departamento
            response_dept = self.session.post(
                self.base_url,
                headers={
                    **self.headers,
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "Faces-Request": "partial/ajax",
                    "X-Requested-With": "XMLHttpRequest",
                },
                data=data_departamento
            )
            
            # Pausa para evitar sobrecarga del servidor
            time.sleep(2)
            
            # Ahora seleccionamos Medellín como municipio
            data_municipio = {
                "javax.faces.partial.ajax": "true",
                "javax.faces.source": "formFiltro:municipios",
                "javax.faces.partial.execute": "formFiltro:municipios",
                "javax.faces.partial.render": "datos formFiltro",
                "javax.faces.behavior.event": "valueChange",
                "javax.faces.partial.event": "change",
                "formFiltro": "formFiltro",
                "formFiltro:departamentos_input": "ANTIOQUIA",
                "formFiltro:municipios_input": "MEDELLÍN",
                "javax.faces.ViewState": self.view_state
            }
            
            # Hacer la petición para seleccionar municipio y buscar
            response_mun = self.session.post(
                self.base_url,
                headers={
                    **self.headers,
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "Faces-Request": "partial/ajax",
                    "X-Requested-With": "XMLHttpRequest",
                },
                data=data_municipio
            )
            
            # Guardar respuesta para análisis (opcional)
            with open("respuesta_busqueda.xml", "w", encoding="utf-8") as f:
                f.write(response_mun.text)
            
            # Verificar si la respuesta contiene datos
            if "<update id=\"datos\">" in response_mun.text:
                print("Búsqueda exitosa, se encontraron datos")
                return True
            else:
                print("La búsqueda no devolvió datos")
                return False
            
        except Exception as e:
            print(f"Error al realizar búsqueda: {e}")
            return False
    
    def descargar_excel(self):
        """Descarga el archivo Excel con todos los programas"""
        print("Descargando archivo Excel con todos los programas...")
        
        try:
            # Buscar el botón de descarga en la página primero
            response = self.session.get(self.base_url)
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Obtener ViewState actualizado
            view_state_element = soup.find('input', {'name': 'javax.faces.ViewState'})
            if view_state_element and 'value' in view_state_element.attrs:
                self.view_state = view_state_element['value']
                print(f"ViewState actualizado: {self.view_state[:20]}...")
            
            # Buscar el ID del botón de descarga
            download_button = soup.find('button', string=lambda text: 'Descargar programas' in text if text else False)
            
            if download_button:
                button_id = download_button.get('id')
                print(f"ID del botón de descarga encontrado: {button_id}")
            else:
                # Si no encontramos el botón, usamos el ID que aparece en el curl
                button_id = "j_idt154"
                print(f"No se encontró el botón de descarga. Usando ID predeterminado: {button_id}")
            
            # Datos para la petición de descarga basados en el curl proporcionado
            data = {
                f"{button_id}": f"{button_id}",
                f"{button_id}:j_idt156": "",
                "javax.faces.ViewState": self.view_state
            }
            
            # Realizar la solicitud POST para descargar el archivo
            response = self.session.post(
                self.base_url,
                headers=self.headers,
                data=data,
                stream=True  # Importante para manejar archivos grandes
            )
            
            # Verificar si la respuesta es un archivo Excel
            content_type = response.headers.get('Content-Type', '')
            content_disposition = response.headers.get('Content-Disposition', '')
            
            print(f"Content-Type: {content_type}")
            print(f"Content-Disposition: {content_disposition}")
            
            # Guardar el archivo
            if ('excel' in content_type.lower() or 
                'spreadsheetml' in content_type.lower() or 
                'application/vnd.ms-excel' in content_type.lower() or
                'attachment' in content_disposition.lower()):
                
                # Intentar obtener el nombre del archivo del header Content-Disposition
                filename = "programas_hecaa.xlsx"
                if 'filename=' in content_disposition:
                    filename_match = re.search(r'filename=[\"\']?([^\"\';\n]+)', content_disposition)
                    if filename_match:
                        filename = filename_match.group(1)
                
                # Guardar el archivo
                with open(filename, 'wb') as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        f.write(chunk)
                
                print(f"Archivo Excel descargado correctamente como '{filename}'")
                return True
            else:
                # Si no es un archivo Excel, guardar la respuesta para investigar
                print("La respuesta no parece ser un archivo Excel")
                with open("respuesta_descarga.html", "wb") as f:
                    f.write(response.content)
                print("Respuesta guardada en 'respuesta_descarga.html'")
                return False
            
        except Exception as e:
            print(f"Error al descargar el archivo Excel: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def ejecutar_scraping(self):
        """Ejecuta el proceso completo de scraping"""
        try:
            if not self.iniciar_sesion():
                raise Exception("No se pudo iniciar sesión")
            
            # Opcionalmente, podemos filtrar primero por Antioquia y Medellín para asegurarnos
            # de que estamos viendo los datos correctos antes de descargar
            self.buscar_programas_antioquia_medellin()
            
            # Descargar el archivo Excel con todos los programas
            if not self.descargar_excel():
                raise Exception("No se pudo descargar el archivo Excel")
            
            print("Proceso de scraping completado exitosamente")
            return True
        except Exception as e:
            print(f"Error en el proceso de scraping: {e}")
            return False

def main():
    print("===== SCRAPER DE PROGRAMAS ACADÉMICOS HECAA - MEDELLÍN =====")
    print("Este script descargará el archivo Excel con todos los programas")
    print("académicos desde el portal HECAA")
    print("=============================================================")
    
    scraper = HECAAScraper()
    resultado = scraper.ejecutar_scraping()
    
    if resultado:
        print("\nEl archivo Excel con los programas académicos ha sido descargado correctamente.")
        print("Puede encontrar el archivo en el directorio actual.")
    else:
        print("\nNo se pudo completar el proceso de descarga correctamente.")
        print("Verifique los mensajes de error y los archivos de diagnóstico generados.")

if __name__ == "__main__":
    main()