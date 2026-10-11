FROM golang:1.27-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /marshrut-api .

FROM alpine:3.22
RUN addgroup -S marshrut && adduser -S -G marshrut marshrut && mkdir /data && chown marshrut:marshrut /data
COPY --from=build /marshrut-api /usr/local/bin/marshrut-api
USER marshrut
ENV PORT=8080 DATABASE_PATH=/data/marshrut.db
VOLUME /data
EXPOSE 8080
CMD ["marshrut-api"]
