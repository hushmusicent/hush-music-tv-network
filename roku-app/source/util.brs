' HTTP GET returning parsed JSON, or invalid on failure.
function httpGetJson(url as String) as Dynamic
    tp = CreateObject("roMessagePort")
    req = CreateObject("roUrlTransfer")
    req.SetMessagePort(tp)
    req.SetURL(url)
    req.SetCertificatesFile("common:/certs/ca-bundle.crt")
    req.InitClientCertificates()
    req.AddHeader("User-Agent", "HushMusicTV/1.0 Roku")

    if req.AsyncGetToString()
        while true
            msg = wait(0, tp)
            if type(msg) = "roUrlEvent"
                if msg.GetResponseCode() = 200
                    return ParseJson(msg.GetString())
                end if
                exit while
            end if
        end while
    end if
    return invalid
end function

' Given a channel dict and current UTC epoch seconds, return the video
' scheduled to play at this moment (based on 24h synchronized schedule).
function getCurrentVideo(channel as Object, nowUtc as Integer) as Object
    videos = channel.videos
    if videos = invalid or videos.Count() = 0 then return invalid

    ' Compute channel timeline: sum of durations, wrap by seconds-in-day
    totalDur = 0
    for each v in videos
        d = v.duration
        if d = invalid or d <= 0 then d = 300
        totalDur = totalDur + d
    end for
    if totalDur <= 0 then return invalid

    ' Seconds into the current UTC day
    secondsInDay = nowUtc mod 86400
    offset = secondsInDay mod totalDur

    accum = 0
    for each v in videos
        d = v.duration
        if d = invalid or d <= 0 then d = 300
        if offset < accum + d
            ' This video is currently playing; compute seek position
            result = {}
            result.video = v
            result.seek = offset - accum
            return result
        end if
        accum = accum + d
    end for
    return invalid
end function

' Given a raw video item, resolve to a playable Roku stream URL.
' - Uploaded R2 videos (video_url set): use directly
' - YouTube videos: call backend /api/youtube/stream-info to get direct URL
function resolvePlayableUrl(video as Object, backendBase as String) as String
    if video = invalid then return ""

    ' Uploaded R2 video
    if video.video_url <> invalid and Len(video.video_url) > 0
        return video.video_url
    end if

    ' YouTube-sourced: call backend to extract stream URL
    if video.youtube_id <> invalid and Len(video.youtube_id) > 0
        info = httpGetJson(backendBase + "/api/youtube/stream-info/" + video.youtube_id)
        if info <> invalid and info.success = true and info.url <> invalid
            return info.url
        end if
    end if
    return ""
end function
