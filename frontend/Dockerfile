FROM python:3.12-slim
WORKDIR /site
COPY frontend/public /site
EXPOSE 3000
CMD ["python", "-m", "http.server", "3000"]
