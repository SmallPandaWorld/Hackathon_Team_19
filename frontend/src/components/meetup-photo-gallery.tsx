"use client";

import Image from "next/image";
import { Card } from "@/src/components/page";
import { useEffect, useState } from "react";

type MeetupPhoto = {
  id: string;
  quest_id: string;
  quest_title: string;
  uploaded_at: string;
};

function usePhotos(url: string, enabled = true) {
  const [result, setResult] = useState<{ url: string; photos: MeetupPhoto[] }>(
    { url, photos: [] },
  );

  useEffect(() => {
    let cancelled = false;
    if (!enabled) {
      setResult({ url, photos: [] });
      return () => {
        cancelled = true;
      };
    }

    void fetch(url)
      .then((response) => (response.ok ? response.json() : []))
      .then((data: MeetupPhoto[]) => {
        if (!cancelled) {
          setResult({ url, photos: Array.isArray(data) ? data : [] });
        }
      })
      .catch(() => {
        if (!cancelled) setResult({ url, photos: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [url, enabled]);

  return enabled && result.url === url ? result.photos : [];
}

function PhotoGrid({
  photos,
  imageUrl,
}: {
  photos: MeetupPhoto[];
  imageUrl: (photo: MeetupPhoto) => string;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {photos.map((photo) => (
        <figure className="min-w-0" key={photo.id}>
          <div className="relative aspect-square overflow-hidden rounded-xl bg-surface-container">
            <Image
              alt={`Photo from ${photo.quest_title}`}
              className="object-cover"
              fill
              sizes="(max-width: 640px) 45vw, 220px"
              src={imageUrl(photo)}
              unoptimized
            />
          </div>
          <figcaption className="mt-1 truncate text-xs text-muted">
            {photo.quest_title}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

export function MeetupPhotoGallery({ questId }: { questId: string }) {
  const photos = usePhotos(`/api/quests/${encodeURIComponent(questId)}/photos`);
  if (photos.length === 0) return null;

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="font-semibold">Meetup photos</h2>
      <PhotoGrid
        imageUrl={(photo) => `/api/meetup-photos/${photo.id}`}
        photos={photos}
      />
    </Card>
  );
}

export function ProfileMeetupGallery({
  username,
  visible = true,
}: {
  username: string;
  visible?: boolean;
}) {
  const photos = usePhotos(
    `/api/players/${encodeURIComponent(username)}/meetup-photos`,
    visible,
  );
  if (photos.length === 0) return null;

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="font-semibold">Meetup memories</h2>
        <p className="mt-1 text-sm text-muted">
          Photos from meetups this player checked into.
        </p>
      </div>
      <PhotoGrid
        imageUrl={(photo) =>
          `/api/players/${encodeURIComponent(username)}/meetup-photos/${photo.id}/image`
        }
        photos={photos}
      />
    </Card>
  );
}
