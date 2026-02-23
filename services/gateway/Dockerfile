FROM nginx:1.27-alpine
COPY public/ /usr/share/nginx/html/
COPY services/gateway/nginx.conf /etc/nginx/templates/default.conf.template
ENV PORT=8080
ENV BACKEND_HOST=backend.railway.internal
ENV BACKEND_PORT=3000
EXPOSE 8080
