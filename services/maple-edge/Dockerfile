FROM envoyproxy/envoy:v1.31-latest

USER root
COPY envoy.yaml /etc/envoy/envoy.yaml.tmpl
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 443 9901
ENTRYPOINT ["/entrypoint.sh"]
